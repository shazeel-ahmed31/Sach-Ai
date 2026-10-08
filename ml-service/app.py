"""
Sach-AI inference microservice.

Wraps the pre-trained ResNeXt50 + LSTM deepfake detector from
https://github.com/abhijithjadhav/Deepfake_detection_using_deep_learning
(FaceForensics++) behind a small HTTP API:

  GET  /health   -> liveness + which weight files were found
  POST /analyze  -> multipart upload of a video, returns per-frame fake
                    scores, aggregate probabilities, a Grad-CAM overlay of
                    the last analyzed frame, and a JPEG thumbnail.

Video decoding, face detection (OpenCV Haar cascade, standing in for the
repo's dlib face_recognition to stay installable on Windows) and image
encoding all happen here so the Node API server never touches pixels.
"""

import base64
import glob
import os
import re
import tempfile
import threading
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image

import faceconsistency as fcs
import cevit_detector as cevd
from model import IM_SIZE, TRANSFORM, DeepfakeModel, load_model, predict_video

MODELS_DIR = Path(__file__).resolve().parent / "models"
ALLOWED_EXTENSIONS = {"mp4", "mov", "webm", "avi", "mkv", "gif", "3gp", "wmv", "flv", "m4v"}
FACE_PADDING = 40  # same padding the repo applies around detected faces
FACE_DETECT_MAX_SIDE = 640  # face detection runs at most this large, then boxes scale back
THUMBNAIL_MAX_WIDTH = 720
HEATMAP_MAX_WIDTH = 720
MAX_VIDEO_BYTES = int(os.environ.get("MAX_VIDEO_MB", "200")) * 1024 * 1024

# The detector is CPU-heavy; serialize inference to keep memory predictable.
INFERENCE_LOCK = threading.Lock()

_face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

# YuNet (DNN) is substantially more accurate and rotation-tolerant than the
# Haar cascade; it is optional so the service also runs without the model file.
YUNET_PATH = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
_yunet: Optional["cv2.FaceDetectorYN"] = None
if YUNET_PATH.exists():
    try:
        _yunet = cv2.FaceDetectorYN_create(
            str(YUNET_PATH), "", (0, 0), score_threshold=0.5, nms_threshold=0.3, top_k=10
        )
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[face-detector] YuNet unavailable, using Haar cascade: {exc}")

# Generalist detector: Community Forensics ViT-S/16@384 (CVPR 2025, trained on
# 2.7M samples from 4,803 generators). Excellent real-video calibration; used
# as the arbiter that can overrule the heuristics. Optional - the service runs
# without it, just with weaker real/fake evidence.
GENERALIST_PATH = MODELS_DIR / "community_forensics_vit.onnx"
_GEN_MEAN = np.array([0.4815, 0.4578, 0.4082], dtype=np.float32)
_GEN_STD = np.array([0.2686, 0.2613, 0.2758], dtype=np.float32)
_generalist: Optional[ort.InferenceSession] = None
if GENERALIST_PATH.exists():
    try:
        _generalist = ort.InferenceSession(str(GENERALIST_PATH), providers=["CPUExecutionProvider"])
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[generalist] unavailable: {exc}")

# Video-native CrossEfficientViT detector (fully AI-generated video, swaps).
CEV_WEIGHTS = MODELS_DIR / "cross_efficient_vit.pth"
_cev_failed = False


def _cev_session_ready() -> bool:
    return CEV_WEIGHTS.exists() and not _cev_failed


def generalist_input(frame_bgr: np.ndarray) -> np.ndarray:
    """Preprocess one BGR frame to the (1, 3, 384, 384) normalized tensor."""
    h, w = frame_bgr.shape[:2]
    scale = 440 / min(h, w)
    resized = cv2.resize(frame_bgr, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_AREA)
    rh, rw = resized.shape[:2]
    top, left = max(0, (rh - 384) // 2), max(0, (rw - 384) // 2)
    crop = resized[top : top + 384, left : left + 384]
    if crop.shape[:2] != (384, 384):
        crop = cv2.resize(crop, (384, 384), interpolation=cv2.INTER_AREA)
    x = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return ((x - _GEN_MEAN) / _GEN_STD).transpose(2, 0, 1)[None]


def generalist_prob(frame_bgr: np.ndarray) -> float:
    """Fake probability for one BGR frame (single-frame convenience path)."""
    probs = generalist_probs([frame_bgr])
    return probs[0] if probs else 0.0


def generalist_probs(frames_bgr: list[np.ndarray]) -> list[float]:
    """Fake probabilities for raw BGR frames, batched through ONNX."""
    if _generalist is None or not frames_bgr:
        return []
    return generalist_probs_from_inputs([generalist_input(f) for f in frames_bgr])


def generalist_probs_from_inputs(inputs: list[np.ndarray]) -> list[float]:
    """Batched ONNX run over preprocessed (1, 3, 384, 384) tensors.

    Batching is ~2x faster than per-frame runs on CPU; if a runtime rejects
    a batch we fall back to single frames so the signal never disappears.
    """
    if _generalist is None or not inputs:
        return []
    batch = np.concatenate(inputs, axis=0)
    out: list[float] = []
    chunk = 8
    for i in range(0, len(batch), chunk):
        try:
            logits = _generalist.run(None, {"pixel_values": batch[i : i + chunk]})[0]
            flat = logits.reshape(logits.shape[0], -1)[:, 0]
            out.extend(float(1.0 / (1.0 + np.exp(-float(v)))) for v in flat)
        except Exception:  # runtime without dynamic batch: degrade gracefully
            for j in range(i, min(i + chunk, len(batch))):
                logit = _generalist.run(None, {"pixel_values": batch[j : j + 1]})[0]
                out.append(float(1.0 / (1.0 + np.exp(-float(logit.reshape(-1)[0])))))
    return out


def generalist_aggregate(probs: list[float]) -> Optional[dict]:
    if len(probs) < 5 or _generalist is None:
        return None
    a = np.array(probs, dtype=np.float64)
    return {
        "mean": round(float(a.mean()), 4),
        "max": round(float(a.max()), 4),
        "fracHigh": round(float((a >= 0.5).mean()), 4),
        "framesChecked": len(probs),
    }

app = FastAPI(title="Sach-AI Inference Service", version="1.2.0")

# {sequence_length: (model, weight_filename)}
_models: dict[int, tuple[DeepfakeModel, str]] = {}


def available_weights() -> list[tuple[int, int, str]]:
    """Parse model_{acc}_acc_{frames}_frames_*.pt filenames (both the
    'final_data' and 'FF_data' variants published in the Drive folder)."""
    out = []
    for path in glob.glob(str(MODELS_DIR / "*.pt")):
        m = re.match(r"model_(\d+)_acc_(\d+)_frames_.+\.pt", os.path.basename(path))
        if m:
            out.append((int(m.group(1)), int(m.group(2)), os.path.basename(path)))
    return out


def get_model(sequence_length: int) -> tuple[DeepfakeModel, str]:
    """Load (and cache) the most accurate weight file for a sequence length."""
    if sequence_length in _models:
        return _models[sequence_length]
    candidates = [w for w in available_weights() if w[1] == sequence_length]
    if not candidates:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "unsupported_sequence_length",
                "message": f"No weights for {sequence_length} frames.",
                "available": sorted({w[1] for w in available_weights()}),
            },
        )
    best = max(candidates, key=lambda w: w[0])
    model = load_model(str(MODELS_DIR / best[2]))
    _models[sequence_length] = (model, best[2])
    return _models[sequence_length]


def detect_face(bgr_frame: np.ndarray) -> Optional[tuple[int, int, int, int]]:
    """Best face box (x, y, w, h) in FULL-RESOLUTION frame coordinates.

    YuNet first with a Haar fallback. Detection runs on a downscaled copy
    (longest side FACE_DETECT_MAX_SIDE) - face detection cost grows with
    pixel count and a half-resolution YuNet is ~4x faster while remaining
    accurate for the crop-scale faces this pipeline needs - and the found
    box is mapped back to full-resolution coordinates.
    """
    h, w = bgr_frame.shape[:2]
    max_side = max(h, w)
    scale = min(1.0, FACE_DETECT_MAX_SIDE / max_side)
    if scale < 1.0:
        small = cv2.resize(
            bgr_frame,
            (int(round(w * scale)), int(round(h * scale))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        small = bgr_frame
    inv = 1.0 / scale
    sh, sw = small.shape[:2]

    if _yunet is not None:
        try:
            _yunet.setInputSize((sw, sh))
            _, faces = _yunet.detect(small)
            if faces is not None and len(faces) > 0:
                # faces rows: [x, y, w, h, 5 landmarks..., score]
                x, y, fw, fh, score = faces[0][0], faces[0][1], faces[0][2], faces[0][3], faces[0][-1]
                if score >= 0.5:
                    return int(x * inv), int(y * inv), int(fw * inv), int(fh * inv)
        except cv2.error:
            pass  # fall through to Haar

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    haar = _face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    if len(haar) == 0:
        return None
    x, y, fw, fh = max(haar, key=lambda f: f[2] * f[3])
    return int(x * inv), int(y * inv), int(fw * inv), int(fh * inv)


class FaceTracker:
    """Keeps a smoothed face box across sampled frames.

    Feeding the classifier full frames when one detection is missed is the
    single biggest real-world accuracy killer for a face-crop model, so a
    miss reuses the last known box (position exponentially smoothed) instead.
    """

    def __init__(self, frame_w: int, frame_h: int, padding: int = FACE_PADDING):
        self.frame_w = frame_w
        self.frame_h = frame_h
        self.padding = padding
        self.box: Optional[tuple[float, float, float, float]] = None
        self.hits = 0
        self.misses_in_a_row = 0
        self.total_misses = 0

    def observe(self, frame_bgr: np.ndarray) -> tuple[np.ndarray, Optional[tuple[int, int, int, int]]]:
        """Return (face crop, raw detection box for this frame).

        The raw box is only present when a face was detected in THIS frame;
        the face-swap consistency check uses it (a box carried across a scene
        cut would measure the wrong region)."""
        h, w = frame_bgr.shape[:2]
        detected = detect_face(frame_bgr)

        if detected is not None:
            x, y, fw, fh = (float(v) for v in detected)
            if self.box is None:
                self.box = (x, y, fw, fh)
            else:
                px, py, pw, ph = self.box
                # A big jump of the box center means a scene cut or speaker
                # change - snap to the new face instead of smoothing across it.
                cx, cy = x + fw / 2, y + fh / 2
                pcx, pcy = px + pw / 2, py + ph / 2
                jump = ((cx - pcx) ** 2 + (cy - pcy) ** 2) ** 0.5
                if jump > 0.3 * min(w, h):
                    self.box = (x, y, fw, fh)
                else:
                    # Exponential smoothing keeps crops stable within a shot;
                    # the model is sensitive to jittery box placement.
                    self.box = (
                        0.65 * px + 0.35 * x,
                        0.65 * py + 0.35 * y,
                        0.65 * pw + 0.35 * fw,
                        0.65 * ph + 0.35 * fh,
                    )
            self.hits += 1
            self.misses_in_a_row = 0
        else:
            self.total_misses += 1
            self.misses_in_a_row += 1

        if self.box is None:
            return frame_bgr, None  # no face anywhere yet: honest full-frame fallback

        # Give up on the carried box only after a long drought; meanwhile the
        # padding absorbs natural drift.
        if self.misses_in_a_row > 25:
            return frame_bgr, None

        x, y, fw, fh = self.box
        pad = self.padding
        top, bottom = max(0, int(y) - pad), min(h, int(y + fh) + pad)
        left, right = max(0, int(x) - pad), min(w, int(x + fw) + pad)
        if bottom - top < 40 or right - left < 40:
            return frame_bgr, None
        return frame_bgr[top:bottom, left:right], detected


def sample_frame_indices(video: cv2.VideoCapture, sequence_length: int) -> list[int]:
    """Evenly spaced frame indices across the entire video."""
    total = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        return []
    count = min(sequence_length, total)
    # Spread inside [2%, 98%] of the clip to avoid black lead-in/out frames.
    lo = int(total * 0.02)
    hi = max(int(total * 0.98) - 1, lo)
    span = hi - lo
    if count == 1:
        return [lo + span // 2]
    return sorted({lo + int(round(span * i / (count - 1))) for i in range(count)})


def encode_jpeg_dataurl(bgr_image: np.ndarray, max_width: int, quality: int = 82) -> Optional[str]:
    h, w = bgr_image.shape[:2]
    if w <= 0 or h <= 0:
        return None
    if w > max_width:
        scale = max_width / w
        bgr_image = cv2.resize(bgr_image, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", bgr_image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        return None
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def overlay_cam(frame_bgr: np.ndarray, cam: np.ndarray) -> np.ndarray:
    """Repo-style JET colormap Grad-CAM overlay on the analyzed frame."""
    heatmap = cv2.applyColorMap(cam, cv2.COLORMAP_JET)
    heatmap = cv2.resize(heatmap, (frame_bgr.shape[1], frame_bgr.shape[0]))
    return cv2.addWeighted(heatmap, 0.45, frame_bgr, 0.55, 0)


@app.get("/health")
def health():
    weights = available_weights()
    return {
        "status": "ok",
        "weights": [
            {"file": f, "accuracy": acc, "sequenceLength": seq} for acc, seq, f in sorted(weights, key=lambda w: w[1])
        ],
        "loaded": sorted(_models.keys()),
        # Per-signal availability for the four-model ensemble.
        "signals": {
            "lstm": {"available": bool(weights), "weightFiles": len(weights)},
            "faceSwap": {"available": True},
            "generalist": {"available": _generalist is not None},
            "cevit": {"available": _cev_session_ready()},
        },
        "faceDetector": "yunet" if _yunet is not None else "haar",
    }


@app.post("/analyze")
async def analyze(
    video: UploadFile = File(...),
    sequence_length: int = Form(20, alias="sequenceLength"),
):
    if sequence_length not in (10, 20, 40, 60, 80, 100):
        raise HTTPException(status_code=400, detail="sequenceLength must be one of 10, 20, 40, 60, 80, 100")
    ext = (video.filename or "").rsplit(".", 1)[-1].lower() if video.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported video extension .{ext}")

    started = time.perf_counter()
    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False, dir=str(Path(tempfile.gettempdir()))) as tmp:
            tmp_path = tmp.name
            total = 0
            while chunk := await video.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_VIDEO_BYTES:
                    raise HTTPException(status_code=413, detail="Video exceeds the upload size limit")
                tmp.write(chunk)
            if not total:
                raise HTTPException(status_code=400, detail="Empty upload")

        capture = cv2.VideoCapture(tmp_path)
        if not capture.isOpened():
            raise HTTPException(status_code=400, detail="Could not decode the video.")
        try:
            fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration_sec = (capture.get(cv2.CAP_PROP_FRAME_COUNT) / fps) if fps > 0 else 0.0

            wanted = sample_frame_indices(capture, sequence_length)
            if not wanted:
                raise HTTPException(status_code=400, detail="Video has no readable frames.")
            wanted_set = set(wanted)

            frames, timestamps = [], []
            log_ratios: list[float] = []
            gen_inputs: list[np.ndarray] = []  # preprocessed 384px tensors, one per sampled frame
            cev_crops: list[np.ndarray] = []  # BGR face crops for the video-native detector
            tracker = FaceTracker(width, height)
            index = 0
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                if index in wanted_set:
                    crop, raw_box = tracker.observe(frame)
                    if raw_box is not None:
                        lr = fcs.frame_log_ratio(frame, raw_box)
                        if lr is not None:
                            log_ratios.append(lr)
                    if _generalist is not None:
                        gen_inputs.append(generalist_input(frame))
                    cev_crops.append(crop)
                    frames.append(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                    timestamps.append(round(index / fps, 2))
                    if len(frames) == len(wanted):
                        break
                index += 1
        finally:
            # Windows keeps the file locked until the capture is released.
            capture.release()

        if not frames:
            raise HTTPException(status_code=400, detail="No frames could be sampled.")

        decode_ms = int((time.perf_counter() - started) * 1000)

        face_swap = fcs.aggregate(log_ratios)

        # The generalist ViT (ONNX) and CrossEfficientViT (torch) are
        # independent of the sequence model, so they score in a side thread
        # while the ResNeXt+LSTM runs. On a 4-core CPU this overlaps two
        # different runtimes instead of running ~40 s of signals back-to-back
        # with inference.
        signal_results: dict = {"generalist": None, "cev": None}

        def run_signal_detectors() -> None:
            # The two auxiliary detectors score a uniform subsample of the
            # sampled frames (the primary LSTM still sees every frame): their
            # aggregates are statistics over the whole clip, so ~32 frames
            # carry the same evidence at a fraction of the CPU cost on small
            # machines. Ceiling division: 60 frames -> step 2 -> 30 scored.
            gen_sub = gen_inputs[:: max(1, -(-len(gen_inputs) // 32))]
            cev_sub = cev_crops[:: max(1, -(-len(cev_crops) // 32))]
            try:
                signal_results["generalist"] = generalist_aggregate(
                    generalist_probs_from_inputs(gen_sub)
                )
            except Exception as exc:  # keep the scan alive
                print(f"[generalist] scoring failed, skipping signal: {exc}")
            try:
                if _cev_session_ready():
                    signal_results["cev"] = cevd.aggregate(cevd.cev_probs(cev_sub))
            except Exception as exc:  # keep the scan alive
                global _cev_failed
                _cev_failed = True
                print(f"[cevit] frame scoring failed, disabling for session: {exc}")

        signals_thread = threading.Thread(target=run_signal_detectors, daemon=True)
        signals_thread.start()

        model, weight_file = get_model(sequence_length)
        with INFERENCE_LOCK:
            result = predict_video(model, frames)

        signals_thread.join()
        generalist = signal_results["generalist"]
        cev = signal_results["cev"]
        # The signal detectors overlap the sequence model, so the two stage
        # timings intentionally do not sum to the total.
        models_ms = int((time.perf_counter() - started) * 1000) - decode_ms

        lstm_windows = result.get("windowProbabilities") or []
        frame_arr = np.array(result["frameScores"], dtype=np.float64)
        lstm_stats = {
            "sequenceProbability": result["fakeProbability"],
            "windowProbabilities": [round(p, 4) for p in lstm_windows],
            "windowMax": round(max(lstm_windows), 4) if lstm_windows else result["fakeProbability"],
            "windowMean": round(float(np.mean(lstm_windows)), 4) if lstm_windows else result["fakeProbability"],
            "frames": {
                "mean": round(float(frame_arr.mean()), 4) if len(frame_arr) else 0.0,
                "median": round(float(np.median(frame_arr)), 4) if len(frame_arr) else 0.0,
                "p90": round(float(np.percentile(frame_arr, 90)), 4) if len(frame_arr) else 0.0,
                "max": round(float(frame_arr.max()), 4) if len(frame_arr) else 0.0,
                "fracHigh": round(float((frame_arr >= 0.5).mean()), 4) if len(frame_arr) else 0.0,
                "framesChecked": len(frame_arr),
            },
        }

        # Rebuild the last analyzed frame's face crop for thumbnail/heatmap.
        last_crop_rgb = frames[-1]
        last_crop_bgr = cv2.cvtColor(last_crop_rgb, cv2.COLOR_RGB2BGR)
        heatmap_url = encode_jpeg_dataurl(overlay_cam(last_crop_bgr, result["cam"]), HEATMAP_MAX_WIDTH)
        thumbnail_url = encode_jpeg_dataurl(last_crop_bgr, THUMBNAIL_MAX_WIDTH)

        return {
            "engine": "sach-model",
            "model": weight_file,
            "sequenceLength": sequence_length,
            "framesAnalyzed": len(frames),
            "facesDetected": tracker.hits,
            "faceCoverage": round(tracker.hits / max(1, len(frames)), 2),
            "faceDetector": "yunet" if _yunet is not None else "haar",
            "durationSec": round(duration_sec, 2),
            "width": width,
            "height": height,
            "fps": round(float(fps), 3),
            "prediction": result["prediction"],
            "confidence": result["confidence"],
            "fakeProbability": result["fakeProbability"],
            "realProbability": result["realProbability"],
            "frames": [
                {"timestamp": t, "fakeScore": s}
                for t, s in zip(timestamps, result["frameScores"])
            ],
            "thumbnail": thumbnail_url,
            "heatmap": heatmap_url,
            "faceSwap": face_swap,
            "generalist": generalist,
            "cev": cev,
            "lstm": lstm_stats,
            "stageMs": {"decodeAndFaces": decode_ms, "modelsParallel": models_ms},
            "inferenceMs": int((time.perf_counter() - started) * 1000),
        }
    finally:
        # Best-effort cleanup: a released capture can still be held for a
        # moment by antivirus/indexers on Windows, so retry briefly.
        if tmp_path:
            for _ in range(5):
                try:
                    os.unlink(tmp_path)
                    break
                except PermissionError:
                    time.sleep(0.2)
                except FileNotFoundError:
                    break


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8600, log_level="info")
