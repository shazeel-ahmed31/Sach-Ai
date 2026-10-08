"""
Evaluate CrossEfficientViT (Coccomini et al., arXiv:2107.02612; weights via
deepsafe-weights HF mirror) on the user's labeled sample videos.

Preprocessing mirrors the original repo's test path: YuNet face crops,
isotropic resize to 224 + constant-pad to square, N evenly spaced frames.
Output: sigmoid(logit) = fake probability per video (mean over frames).
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml-service"))
CEVIT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(r"C:/Users/abdul/AppData/Local/Temp/cevit/cross-efficient-vit")
sys.path.insert(0, str(CEVIT))

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
SEQ = 30
SIZE = 224


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


def face_square(frame_bgr, box):
    """Crop face + padding, then isotropic-resize to 224 and pad to square."""
    h, w = frame_bgr.shape[:2]
    x, y, fw, fh = [int(v) for v in box]
    crop = frame_bgr[max(0, y - 40):min(h, y + fh + 40), max(0, x - 40):min(w, x + fw + 40)]
    ch, cw = crop.shape[:2]
    scale = SIZE / max(ch, cw)
    resized = cv2.resize(crop, (max(1, int(cw * scale)), max(1, int(ch * scale))), interpolation=cv2.INTER_AREA)
    out = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    rh, rw = resized.shape[:2]
    out[(SIZE - rh) // 2:(SIZE - rh) // 2 + rh, (SIZE - rw) // 2:(SIZE - rw) // 2 + rw] = resized
    return out


def main():
    from efficient_net.efficientnet_pytorch import EfficientNet
    import cross_efficient_vit as cev

    # Avoid ImageNet download at init; the checkpoint carries trained weights.
    EfficientNet.from_pretrained = lambda *a, **k: EfficientNet.from_name("efficientnet-b0")

    config = {"model": {
        "image-size": 224, "num-classes": 1, "depth": 4,
        "sm-dim": 192, "sm-patch-size": 7, "sm-enc-depth": 2, "sm-enc-dim-head": 64,
        "sm-enc-heads": 8, "sm-enc-mlp-dim": 2048,
        "lg-dim": 384, "lg-patch-size": 56, "lg-enc-depth": 3, "lg-enc-dim-head": 64,
        "lg-enc-heads": 8, "lg-enc-mlp-dim": 2048,
        "cross-attn-depth": 2, "cross-attn-dim-head": 64, "cross-attn-heads": 8,
        "lg-channels": 24, "sm-channels": 1280,
        "dropout": 0.15, "emb-dropout": 0.15,
    }}
    model = cev.CrossEfficientViT(config=config)
    state = torch.load(str(ROOT / "ml-service" / "models" / "cross_efficient_vit.pth"), map_location="cpu", weights_only=True)
    missing, unexpected = model.load_state_dict(state, strict=False)
    print(f"state_dict: {len(missing)} missing, {len(unexpected)} unexpected")
    if missing:
        print("  missing sample:", missing[:5])
    model.eval()

    yunet = cv2.FaceDetectorYN.create(
        str(ROOT / "ml-service" / "models" / "face_detection_yunet_2023mar.onnx"), "", (0, 0),
        score_threshold=0.5, nms_threshold=0.3, top_k=10,
    )

    print(f"{'video':<44}{'truth':<6}{'mean':>7}{'med':>7}{'max':>7}{'frac.5':>8}{'n':>4}")
    for name, truth in VIDEOS.items():
        cap = cv2.VideoCapture(str(SAMPLE_DIR / name))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total <= 0:
            print(f"{name[:43]:<44}{truth:<6}  UNREADABLE")
            continue
        count = min(SEQ, total)
        lo = int(total * 0.02)
        hi = max(int(total * 0.98) - 1, lo)
        wanted = sorted({lo + int((hi - lo) * i / max(1, count - 1)) for i in range(count)})
        wanted_set = set(wanted)

        frames = []
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx in wanted_set:
                box = largest_face(yunet, frame)
                if box is not None:
                    frames.append(face_square(frame, box))
                if len(frames) == count:
                    break
            idx += 1
        cap.release()

        if not frames:
            print(f"{name[:43]:<44}{truth:<6}  no faces")
            continue
        batch = torch.stack([torch.from_numpy(f.transpose(2, 0, 1)).float() for f in frames])
        with torch.inference_mode():
            logits = []
            for i in range(0, batch.shape[0], 8):
                logits.append(model(batch[i : i + 8]).reshape(-1))
            logits = torch.cat(logits)
        probs = torch.sigmoid(logits).numpy()
        print(
            f"{name[:43]:<44}{truth:<6}{probs.mean():>7.3f}{np.median(probs):>7.3f}"
            f"{probs.max():>7.3f}{(probs >= 0.5).mean():>8.2f}{len(probs):>4}"
        )


if __name__ == "__main__":
    main()
