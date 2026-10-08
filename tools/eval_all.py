"""
Batch evaluation of all labeled sample videos through the three production
signals (ResNeXt+LSTM, face-swap artifact check, Community Forensics ViT),
using the same sampling logic as the production /analyze endpoint.

Ground truth (user-provided):
  FAKE: avengers deepfake, deepfake_1, This is not Morgan Freeman,
        WhatsApp Video 2026-09-01 (Magic Hour AI-generated)
  REAL: new_video_jalal, sample_real, Sample_real2
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml-service"))
sys.path.insert(0, str(ROOT / "tools"))

import faceconsistency as fcs  # noqa: E402
from eval_generalist import fake_prob  # noqa: E402
from model import TRANSFORM, DeepfakeModel, load_model  # noqa: E402

VIDEOS = {
    "avengers deepfake.mp4": "FAKE",
    "deepfake_1.mp4": "FAKE",
    "This is not Morgan Freeman  -  A Deepfake Singularity.mp4": "FAKE",
    "WhatsApp Video 2026-09-01 at 11.05.19 PM.mp4": "FAKE",
    "new_video_jalal.mp4": "REAL",
    "sample_real.mp4": "REAL",
    "Sample_real2.mp4": "REAL",
}
SAMPLE_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:/Users/abdul/AppData/Local/Temp/fyp")
SEQ = 60


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


def main():
    import onnxruntime as ort
    weights = sorted((ROOT / "ml-service" / "models").glob("model_*_60_frames*.pt"))
    model = load_model(str(weights[0]))
    yunet = cv2.FaceDetectorYN.create(
        str(ROOT / "ml-service" / "models" / "face_detection_yunet_2023mar.onnx"), "", (0, 0),
        score_threshold=0.5, nms_threshold=0.3, top_k=10,
    )

    print(f"{'video':<28}{'truth':<6}{'lstmSeq':>8}{'p90':>6}{'swap':>6}{'genMean':>8}{'genFracHi':>10}{'genMax':>7}  verdict-logic")
    for name, truth in VIDEOS.items():
        path = SAMPLE_DIR / name
        cap = cv2.VideoCapture(str(path))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total <= 0:
            print(f"{name:<28}{truth:<6}  UNREADABLE")
            continue
        count = min(SEQ, total)
        lo = int(total * 0.02)
        hi = max(int(total * 0.98) - 1, lo)
        wanted = sorted({lo + int((hi - lo) * i / max(1, count - 1)) for i in range(count)})
        wanted_set = set(wanted)

        crops, lrs, gen_probs = [], [], []
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx in wanted_set:
                box = largest_face(yunet, frame)
                if box is not None:
                    x, y, fw, fh = [int(v) for v in box]
                    h, w = frame.shape[:2]
                    crop = frame[max(0, y - 40):min(h, y + fh + 40), max(0, x - 40):min(w, x + fw + 40)]
                    crops.append(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                    lr = fcs.frame_log_ratio(frame, tuple(float(v) for v in box))
                    if lr is not None:
                        lrs.append(lr)
                gen_probs.append(fake_prob(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
                if len(crops) == count:
                    break
            idx += 1
        cap.release()

        # LSTM sequence inference
        if crops:
            tensors = torch.stack([TRANSFORM(c) for c in crops]).unsqueeze(0)
            with torch.inference_mode():
                _, logits = model(tensors)
            probs = torch.softmax(logits, dim=1)[0]
            lstm_seq = float(probs[0])
            # per-timestep scores
            with torch.inference_mode():
                x = tensors.view(tensors.shape[1], 3, 112, 112)
                fmap = model.model(x)
                pooled = model.avgpool(fmap).view(1, tensors.shape[1], 2048)
                x_lstm, _ = model.lstm(pooled, None)
                step = torch.softmax(model.linear1(x_lstm[0]), dim=1)
                frame_scores = [float(p[0]) for p in step]
            p90 = float(np.percentile(frame_scores, 90))
        else:
            lstm_seq, p90 = None, None

        swap = fcs.aggregate(lrs)
        swap_prob = swap["probability"] if swap else None
        g_mean = float(np.mean(gen_probs)) if gen_probs else None
        g_frac = float(np.mean([p >= 0.5 for p in gen_probs])) if gen_probs else None
        g_max = float(np.max(gen_probs)) if gen_probs else None

        print(
            f"{name[:27]:<28}{truth:<6}"
            f"{lstm_seq if lstm_seq is not None else -1:>8.3f}{p90 if p90 is not None else -1:>6.2f}"
            f"{swap_prob if swap_prob is not None else -1:>6.2f}"
            f"{g_mean if g_mean is not None else -1:>8.3f}{g_frac if g_frac is not None else -1:>10.2f}"
            f"{g_max if g_max is not None else -1:>7.2f}"
        )


if __name__ == "__main__":
    main()
