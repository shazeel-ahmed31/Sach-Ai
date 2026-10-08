"""
Decision-layer experiment on the critical pair:
  REAL: sample_real.mp4 (user's portrait video, beauty-filtered)
  FAKE: avengers deepfake.mp4 (inswapper face-swap meme)

Prints per-video distributions for every candidate signal so the verdict
thresholds can be set on evidence instead of guesswork.
"""
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from eval_generalist import largest_face, fake_prob  # noqa: E402

MODELS_DIR = Path(__file__).resolve().parent.parent / "ml-service" / "models"


def seam_metric(frame_bgr, box):
    """Gradient energy in a thin band just outside the face ellipse (where a
    swap blend seam would land) relative to a farther annulus."""
    x, y, fw, fh = box
    H, W = frame_bgr.shape[:2]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad = np.sqrt(gx * gx + gy * gy)

    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = x + fw / 2.0, y + fh / 2.0
    d = np.sqrt(((xx - cx) / (fw * 0.5)) ** 2 + ((yy - cy) / (fh * 0.55)) ** 2)
    band_seam = (d > 0.95) & (d <= 1.15)
    band_far = (d > 1.4) & (d <= 1.8)
    if band_seam.sum() < 300 or band_far.sum() < 300:
        return None
    e_seam = float(np.mean(grad[band_seam]))
    e_far = float(np.mean(grad[band_far]))
    return float(e_seam / (e_far + 1e-6))


def hf_residual_ratio(frame_bgr, box):
    """Same smoothness signal as the production check (for reference)."""
    x, y, fw, fh = box
    H, W = frame_bgr.shape[:2]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    den = cv2.medianBlur(gray.astype(np.uint8), 5).astype(np.float32)
    res = gray - den
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = x + fw / 2.0, y + fh / 2.0
    d = np.sqrt(((xx - cx) / (fw * 0.48)) ** 2 + ((yy - cy) / (fh * 0.52)) ** 2)
    m_in = d <= 1.0
    m_ring = (d > 1.15) & (d <= 1.6)
    if m_in.sum() < 400 or m_ring.sum() < 400:
        return None
    e_in = float(np.mean(res[m_in] ** 2))
    e_ring = float(np.mean(res[m_ring] ** 2))
    return float(np.log((e_in + 1e-6) / (e_ring + 1e-6)))


def analyze(path, seq=60):
    import onnxruntime
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

    frame_l, seam_l, hf_l, gen_full, gen_face = [], [], [], [], []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx in wanted_set:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            gen_full.append(fake_prob(rgb))
            box = largest_face(yunet, frame)
            if box is not None and box[2] > 48 and box[3] > 48:
                s = seam_metric(frame, box)
                if s is not None:
                    seam_l.append(s)
                h = hf_residual_ratio(frame, box)
                if h is not None:
                    hf_l.append(h)
                fc = frame_bgr_fc = frame[
                    max(0, int(box[1]) - 40): int(box[1] + box[3]) + 40,
                    max(0, int(box[0]) - 40): int(box[0] + box[2]) + 40,
                ]
                if min(fc.shape[:2]) >= 64:
                    gen_face.append(fake_prob(cv2.cvtColor(fc, cv2.COLOR_BGR2RGB)))
        idx += 1
    cap.release()

    def stats(v, tag):
        if not v:
            return f"{tag}: n/a"
        a = np.array(v)
        extra = f" frac<-0.5={(a < -0.5).mean():.2f}" if tag == "hf_logratio" else ""
        return (f"{tag}: mean={a.mean():.3f} med={np.median(a):.3f} p90={np.percentile(a, 90):.3f} "
                f"max={a.max():.3f} frac>=0.5={(a >= 0.5).mean():.2f}{extra} n={len(a)}")

    print(f"  {stats(seam_l, 'seam_ratio')}")
    print(f"  {stats(hf_l, 'hf_logratio')}")
    print(f"  {stats(gen_full, 'gen_full')}")
    print(f"  {stats(gen_face, 'gen_face')}")


if __name__ == "__main__":
    for label, path in [
        ("REAL sample_real", r"C:/Users/abdul/Downloads/sample_real.mp4"),
        ("FAKE avengers", r"C:/Users/abdul/Downloads/avengers deepfake.mp4"),
    ]:
        print(f"[{label}]")
        analyze(path)
