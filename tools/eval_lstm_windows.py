"""
Experiment: does windowed LSTM inference (3 x 20-frame windows, majority
behavior) recover the sequence verdict on videos where the single 60-frame
pass is blind? Compares single-pass vs windowed verdicts on the labeled set.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml-service"))
sys.path.insert(0, str(ROOT / "tools"))

from eval_generalist import largest_face  # noqa: E402
from model import TRANSFORM, load_model  # noqa: E402

VIDEOS = {
    "avengers deepfake.mp4": "FAKE",
    "deepfake_1.mp4": "FAKE",
    "This is not Morgan Freeman  -  A Deepfake Singularity.mp4": "FAKE",
    "WhatsApp Video 2026-09-01 at 11.05.19 PM.mp4": "FAKE",
    "new_video_jalal.mp4": "REAL",
    "sample_real.mp4": "REAL",
    "Sample_real2.mp4": "REAL",
}
SAMPLE_DIR = Path(r"C:/Users/abdul/AppData/Local/Temp/fyp")


def main():
    model = load_model(str(ROOT / "ml-service" / "models" / "model_97_acc_60_frames_FF_data.pt"))
    yunet = cv2.FaceDetectorYN.create(
        str(ROOT / "ml-service" / "models" / "face_detection_yunet_2023mar.onnx"), "", (0, 0),
        score_threshold=0.5, nms_threshold=0.3, top_k=10,
    )

    print(f"{'video':<30}{'truth':<6}{'single':>8}{'win1':>7}{'win2':>7}{'win3':>7}{'wMax':>7}{'wMean':>7}{'p90':>6}")
    for name, truth in VIDEOS.items():
        cap = cv2.VideoCapture(str(SAMPLE_DIR / name))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        count = min(60, total)
        lo = int(total * 0.02)
        hi = max(int(total * 0.98) - 1, lo)
        wanted = sorted({lo + int((hi - lo) * i / max(1, count - 1)) for i in range(count)})
        wanted_set = set(wanted)

        crops = []
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
            idx += 1
        cap.release()

        def seq_prob(crops_):
            if len(crops_) < 8:
                return None
            t = torch.stack([TRANSFORM(c) for c in crops_]).unsqueeze(0)
            with torch.inference_mode():
                _, logits = model(t)
            return float(torch.softmax(logits, dim=1)[0][0])

        single = seq_prob(crops)
        # 3 contiguous windows of 20
        n = len(crops)
        wsize = max(10, n // 3)
        windows = [crops[i : i + wsize] for i in range(0, n - wsize + 1, wsize)][:3]
        wprobs = [p for p in (seq_prob(w) for w in windows) if p is not None]

        all_crops = crops
        t = torch.stack([TRANSFORM(c) for c in all_crops]).unsqueeze(0)
        with torch.inference_mode():
            x = t.view(t.shape[1], 3, 112, 112)
            fmap = model.model(x)
            pooled = model.avgpool(fmap).view(1, t.shape[1], 2048)
            x_lstm, _ = model.lstm(pooled, None)
            step = torch.softmax(model.linear1(x_lstm[0]), dim=1)
        frame_scores = np.array([float(p[0]) for p in step])
        p90 = float(np.percentile(frame_scores, 90))

        wp = [f"{p:.2f}" for p in wprobs] + ["-"] * (3 - len(wprobs))
        print(
            f"{name[:29]:<30}{truth:<6}{single:>8.3f}{wp[0]:>7}{wp[1]:>7}{wp[2]:>7}"
            f"{(max(wprobs) if wprobs else -1):>7.3f}{(np.mean(wprobs) if wprobs else -1):>7.3f}{p90:>6.2f}"
        )


if __name__ == "__main__":
    main()
