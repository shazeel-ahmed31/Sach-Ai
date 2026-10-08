"""
Face-swap artifact detector (engine signal #2).

The ResNeXt+LSTM model was trained on FaceForensics++ and is confidently
wrong on modern face-swap tools (InsightFace inswapper / roop / Reactor -
the "celebrity face-swap meme" genre). Those tools render the face at low
internal resolution (e.g. 128x128) and blend it into the native frame, so
the face interior differs from the camera-native pixels around it in two
measurable ways:

  1. Smoothness: the rendered face carries less high-frequency energy than
     its surroundings (median-filter residual ratio, kernels scaled to the
     face size).
  2. Band limitation: the render has no real detail above its internal
     Nyquist, so the downsample-reupsample residual ("hi-band") inside the
     face is suppressed relative to the ring.

Each frame returns the more damning (smaller) of the two log ratios; a
systematic negative value across most frames is the swap signature, while
real footage usually shows the opposite (in-focus face vs soft background):

  FAKE avengers deepfake.mp4   mean -0.81, frac(<-0.5) = 0.72
  6 real clips                 mean +0.66..-0.35, frac(<-0.5) = 0..0.33
  real control (test_face)     mean -0.19, frac(<-0.5) = 0.00
  blur-swap synthetic          fires at 1.0
  128px-render synthetic       fires via the hi-band component

Calibrated probability (see tools/eval_signals.py and
tools/eval_swap_check.py for the harnesses):
  frac-smoother ramp  : 0.40 -> 0.75 of frames
  direction ramp      : mean log-ratio -0.30 -> -0.80
Requires >= 8 frames with usable faces before it votes at all.
"""

from typing import Optional

import cv2
import numpy as np

MIN_FACE_PX = 48
MIN_FRAMES = 8


def _ellipse_masks(shape, box):
    h, w = shape[:2]
    x, y, fw, fh = box
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = x + fw / 2.0, y + fh / 2.0
    d = np.sqrt(((xx - cx) / (fw * 0.48)) ** 2 + ((yy - cy) / (fh * 0.52)) ** 2)
    return d <= 1.0, (d > 1.15) & (d <= 1.6)


def _log_ratios(frame_bgr: np.ndarray, box):
    x, y, fw, fh = box
    h, w = frame_bgr.shape[:2]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)

    # Component 1 - smoothness. Blend artifacts live at frequencies relative
    # to the face's rendered size, so the median kernels scale with the face.
    k1 = min(15, max(5, (min(fw, fh) // 32) * 2 + 1))
    k2 = min(k1 + 4, 19)
    masks = _ellipse_masks(frame_bgr.shape, box)
    mask_in, mask_ring = masks
    if mask_in.sum() < 400 or mask_ring.sum() < 400:
        return None
    smooth = []
    for k in (k1, k2):
        den = cv2.medianBlur(gray.astype(np.uint8), k).astype(np.float32)
        res = gray - den
        e_in = float(np.mean(res[mask_in] ** 2))
        e_ring = float(np.mean(res[mask_ring] ** 2))
        smooth.append(float(np.log((e_in + 1e-6) / (e_ring + 1e-6))))

    # Component 2 - band limitation. The residual after removing a
    # half-resolution downsample-reupsample copy isolates detail above the
    # render's internal Nyquist; a low-res face render has almost none.
    small = cv2.resize(gray, (max(1, w // 2), max(1, h // 2)), interpolation=cv2.INTER_AREA)
    back = cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)
    hi = gray - back
    e_in = float(np.mean(hi[mask_in] ** 2))
    e_ring = float(np.mean(hi[mask_ring] ** 2))
    band = float(np.log((e_in + 1e-8) / (e_ring + 1e-8)))

    return min(min(smooth), band)


def frame_log_ratio(frame_bgr: np.ndarray, box) -> Optional[float]:
    """Combined per-frame swap log ratio, or None if the face is unusable."""
    x, y, fw, fh = box
    if fw < MIN_FACE_PX or fh < MIN_FACE_PX:
        return None
    return _log_ratios(frame_bgr, box)


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def aggregate(log_ratios: list[float]) -> Optional[dict]:
    n = len(log_ratios)
    if n < MIN_FRAMES:
        return None
    lr = np.array(log_ratios, dtype=np.float64)
    mean = float(lr.mean())
    frac_smoother = float((lr < -0.5).mean())

    # Ramp the vote up as the signature becomes systematic; both a strong
    # share of "face smoother than surroundings" frames AND a strongly
    # negative direction are required, which keeps ordinary footage
    # (in-focus faces on soft backgrounds) at zero.
    frac_d = _clamp01((frac_smoother - 0.40) / 0.35)
    dir_d = _clamp01((-mean - 0.30) / 0.50)
    probability = round(frac_d * dir_d, 3)

    return {
        "probability": probability,
        "framesChecked": n,
        "meanLogRatio": round(mean, 3),
        "fracSmoother": round(frac_smoother, 3),
    }
