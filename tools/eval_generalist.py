"""
Evaluation harness for the Community Forensics ViT generalist detector
(HF: buildborderless/CommunityForensics-DeepfakeDet-ViT, ONNX export).

Scores sampled frames of each video - both full frames and face crops -
and reports aggregate fake probabilities, so the ensemble thresholds can be
calibrated on locally labeled videos.

Usage:
  python eval_generalist.py LABEL video1 [video2 ...]
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

MODELS_DIR = Path(__file__).resolve().parent.parent / "ml-service" / "models"
ONNX_PATH = MODELS_DIR / "community_forensics_vit.onnx"

MEAN = np.array([0.4815, 0.4578, 0.4082], dtype=np.float32)
STD = np.array([0.2686, 0.2613, 0.2758], dtype=np.float32)

_session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
_input_name = _session.get_inputs()[0].name


def preprocess(img_rgb: np.ndarray) -> np.ndarray:
    """RGB uint8 -> NCHW float tensor per the model card:
    shortest edge to 440, center crop 384, CLIP-style normalization."""
    h, w = img_rgb.shape[:2]
    scale = 440 / min(h, w)
    resized = cv2.resize(img_rgb, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_AREA)
    rh, rw = resized.shape[:2]
    top, left = max(0, (rh - 384) // 2), max(0, (rw - 384) // 2)
    crop = resized[top : top + 384, left : left + 384]
    if crop.shape[:2] != (384, 384):  # tiny-source edge case
        crop = cv2.resize(crop, (384, 384), interpolation=cv2.INTER_AREA)
    x = crop.astype(np.float32) / 255.0
    x = (x - MEAN) / STD
    return x.transpose(2, 0, 1)[None]


def fake_prob(img_rgb: np.ndarray) -> float:
    logit = _session.run(None, {_input_name: preprocess(img_rgb)})[0]
    return float(1.0 / (1.0 + np.exp(-logit.reshape(-1)[0])))


def largest_face(yunet, frame):
    h, w = frame.shape[:2]
    yunet.setInputSize((w, h))
    _, faces = yunet.detect(frame)
    if faces is None or len(faces) == 0:
        return None
    f = max(faces, key=lambda f: f[2] * f[3])
    if f[-1] < 0.5:
        return None
    return [float(v) for v in f[:4]]


def face_crop(frame_bgr, box, pad=40):
    h, w = frame_bgr.shape[:2]
    x, y, fw, fh = box
    top, bottom = max(0, int(y) - pad), min(h, int(y + fh) + pad)
    left, right = max(0, int(x) - pad), min(w, int(x + fw) + pad)
    return frame_bgr[top:bottom, left:right]


def analyze(path, seq=30):
    yunet = cv2.FaceDetectorYN_create(
        str(MODELS_DIR / "face_detection_yunet_2023mar.onnx"), "", (0, 0),
        score_threshold=0.5, nms_threshold=0.3, top_k=10,
    )
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    count = min(seq, max(1, total))
    lo, hi = int(total * 0.05), max(int(total * 0.95) - 1, 1)
    wanted = sorted({lo + int((hi - lo) * i / max(1, count - 1)) for i in range(count)})
    wanted_set = set(wanted)

    full_probs, face_probs = [], []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx in wanted_set:
            full_probs.append(fake_prob(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
            box = largest_face(yunet, frame)
            if box is not None and box[2] > 48 and box[3] > 48:
                fc = face_crop(frame, box)
                if min(fc.shape[:2]) >= 64:
                    face_probs.append(fake_prob(cv2.cvtColor(fc, cv2.COLOR_BGR2RGB)))
        idx += 1
    cap.release()

    def agg(v):
        if not v:
            return None
        a = np.array(v)
        return {"mean": round(float(a.mean()), 3), "median": round(float(np.median(a)), 3),
                "frac>=0.5": round(float((a >= 0.5).mean()), 3), "n": len(a)}

    return {"full": agg(full_probs), "face": agg(face_probs)}


if __name__ == "__main__":
    label = sys.argv[1].upper()
    for path in sys.argv[2:]:
        r = analyze(path)
        print(f"[{label}] {Path(path).name}")
        print(f"   full frames : {r['full']}")
        print(f"   face crops  : {r['face']}")
