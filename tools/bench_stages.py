"""One-off stage profiler for the /analyze pipeline (same sampling as app.py)."""
import sys
import time
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml-service"))

import onnxruntime as ort  # noqa: E402
import torch  # noqa: E402

import app as appmod  # noqa: E402  (reuses its detectors + generalist_prob)
import cevit_detector as cevd  # noqa: E402
from model import TRANSFORM, load_model  # noqa: E402

VIDEO = str(ROOT / "ml-service" / "temp" / "test_face.mp4")
SEQ = 60

t0 = time.perf_counter()
model = load_model(str(ROOT / "ml-service" / "models" / "model_97_acc_60_frames_FF_data.pt"))
print(f"lstm load: {time.perf_counter()-t0:.1f}s")

cap = cv2.VideoCapture(VIDEO)
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
count = min(SEQ, total)
lo, hi = int(total * 0.02), max(int(total * 0.98) - 1, 1)
wanted = sorted({lo + int(round((hi - lo) * i / max(1, count - 1))) for i in range(count)})
wanted_set = set(wanted)

t0 = time.perf_counter()
frames, crops = [], []
tracker = appmod.FaceTracker(1280, 1024)
idx = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    if idx in wanted_set:
        crop, _ = tracker.observe(frame)
        crops.append(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
        frames.append(frame)
        if len(frames) == count:
            break
    idx += 1
cap.release()
print(f"decode+faces: {time.perf_counter()-t0:.1f}s ({tracker.hits}/{count} faces)")

t0 = time.perf_counter()
gen = [appmod.generalist_prob(f) for f in frames]
print(f"generalist 1x60: {time.perf_counter()-t0:.1f}s  mean={np.mean(gen):.3f}")

t0 = time.perf_counter()
cev = [cevd.cev_prob(c) for c in crops]
print(f"cevit 1x60: {time.perf_counter()-t0:.1f}s  mean={np.mean(cev):.3f}")

tensors = torch.stack([TRANSFORM(c) for c in crops]).unsqueeze(0)
torch.set_num_threads(torch.get_num_threads())
t0 = time.perf_counter()
with torch.inference_mode():
    fmap, logits = model(tensors)  # backbone pass 1
t1 = time.perf_counter()
with torch.inference_mode():
    x = tensors.view(tensors.shape[1], 3, 112, 112)
    seq_fmap = model.model(x)      # backbone pass 2 (per-frame scores)
t2 = time.perf_counter()
with torch.inference_mode():
    wsize = max(10, tensors.shape[1] // 3)
    for start in range(0, tensors.shape[1] - wsize + 1, wsize):
        window = tensors[:, start : start + wsize]
        if window.shape[1] < 8:
            continue
        model(window)              # backbone pass 3 (windows)
t3 = time.perf_counter()
print(f"lstm main: {t1-t0:.1f}s | per-frame recompute: {t2-t1:.1f}s | windows recompute: {t3-t2:.1f}s")
