"""
Experiment: find frame-level signals that separate modern face-swap deepfakes
(InsightFace/roop style, e.g. celebrity face-swap memes) from real footage,
since the FF++-trained ResNeXt+LSTM model is confidently wrong on them.

Signals per sampled frame (largest YuNet face):
  - log ratio of high-frequency (median-filter residual) energy inside the
    face ellipse vs an annulus just outside it: a swapped face patch was
    rendered at low resolution and blended in, so its noise/sharpness
    fingerprint differs from the camera-native pixels around it.
  - color mismatch between face interior and the annulus (tone mismatch at
    the blend boundary).

Usage:
  python eval_signals.py video1 [video2 ...]
"""
import sys
from pathlib import Path

import cv2
import numpy as np

MODELS_DIR = Path(__file__).resolve().parent.parent / "ml-service" / "models"


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


def frame_signals(frame_bgr, box):
    x, y, fw, fh = box
    H, W = frame_bgr.shape[:2]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    # High-pass residual: frame minus its median-filtered version.
    den = cv2.medianBlur(gray.astype(np.uint8), 5).astype(np.float32)
    res = gray - den

    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = x + fw / 2.0, y + fh / 2.0
    # face ellipse (slightly shrunk), annulus just outside it
    d = np.sqrt(((xx - cx) / (fw * 0.48)) ** 2 + ((yy - cy) / (fh * 0.52)) ** 2)
    mask_in = d <= 1.0
    mask_ring = (d > 1.15) & (d <= 1.6)

    if mask_in.sum() < 400 or mask_ring.sum() < 400:
        return None

    e_in = float(np.mean(res[mask_in] ** 2))
    e_ring = float(np.mean(res[mask_ring] ** 2))
    log_ratio = float(np.log((e_in + 1e-6) / (e_ring + 1e-6)))

    color_in = frame_bgr[mask_in].reshape(-1, 3).mean(axis=0)
    color_ring = frame_bgr[mask_ring].reshape(-1, 3).mean(axis=0)
    color_dist = float(np.linalg.norm(color_in - color_ring))

    sharp_in = float(np.var(cv2.Laplacian(gray, cv2.CV_32F)[mask_in]))
    sharp_ring = float(np.var(cv2.Laplacian(gray, cv2.CV_32F)[mask_ring]))
    sharp_log_ratio = float(np.log((sharp_in + 1e-6) / (sharp_ring + 1e-6)))

    return {
        "log_ratio": log_ratio,
        "color_dist": color_dist,
        "sharp_log_ratio": sharp_log_ratio,
        "e_in": e_in,
        "e_ring": e_ring,
    }


def analyze_video(path, seq=40):
    yunet = cv2.FaceDetectorYN_create(
        str(MODELS_DIR / "face_detection_yunet_2023mar.onnx"), "", (0, 0),
        score_threshold=0.5, nms_threshold=0.3, top_k=10,
    )
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        return None
    count = min(seq, total)
    lo, hi = int(total * 0.05), max(int(total * 0.95) - 1, 1)
    wanted = sorted({lo + int((hi - lo) * i / max(1, count - 1)) for i in range(count)})
    wanted_set = set(wanted)

    rows = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx in wanted_set:
            box = largest_face(yunet, frame)
            if box is not None and box[2] > 48 and box[3] > 48:
                s = frame_signals(frame, box)
                if s:
                    rows.append(s)
            if len(rows) == count:
                break
        idx += 1
    cap.release()

    if not rows:
        return None

    def agg(key):
        vals = np.array([r[key] for r in rows], dtype=np.float64)
        return {"mean": round(float(vals.mean()), 4), "std": round(float(vals.std()), 4)}

    return {
        "frames_with_face": len(rows),
        "log_ratio": agg("log_ratio"),
        "sharp_log_ratio": agg("sharp_log_ratio"),
        "color_dist": agg("color_dist"),
        # fraction of frames where face HF energy deviates strongly either way
        "frac_abs_logratio_gt_0p5": round(
            float(np.mean([abs(r["log_ratio"]) > 0.5 for r in rows])), 3),
        "frac_abs_logratio_gt_0p8": round(
            float(np.mean([abs(r["log_ratio"]) > 0.8 for r in rows])), 3),
    }


if __name__ == "__main__":
    label = sys.argv[1].upper()
    for path in sys.argv[2:]:
        r = analyze_video(path)
        print(f"[{label}] {Path(path).name}")
        if r is None:
            print("   no usable faces")
        else:
            for k, v in r.items():
                print(f"   {k}: {v}")
