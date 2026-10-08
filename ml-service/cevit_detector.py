"""
CrossEfficientViT wrapper - video-native deepfake detector (4th engine signal).

Architecture: Coccomini et al., "Combining EfficientNet and Vision
Transformers for Video Deepfake Detection" (arXiv:2107.02612), vendored from
https://github.com/Davide-Coccomini/Combining-EfficientNet-and-Vision-Transformers-for-Video-Deepfake-Detection
Weights: deepsafe-weights HF mirror (siddharthksah/deepsafe-weights).

Takes face crops (same ones the sequence model consumes), resizes each to a
224px padded square, and returns per-frame fake probabilities. This is the
only production signal that reliably flags fully AI-generated video
(Magic-Hour-style avatars) which neither the FF++ LSTM nor the blend-artifact
check can see.
"""

import sys
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch

_MODELS_DIR = Path(__file__).resolve().parent / "models"
_CEVIDIR = Path(__file__).resolve().parent / "cevit"

_session = None


def _get_session():
    global _session
    if _session is not None:
        return _session
    if str(_CEVIDIR) not in sys.path:
        sys.path.insert(0, str(_CEVIDIR))
    from efficient_net.efficientnet_pytorch import EfficientNet
    import cross_efficient_vit as cev

    # The checkpoint carries the trained EfficientNet weights; skip the
    # ImageNet download that from_pretrained would trigger.
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
    state = torch.load(str(_MODELS_DIR / "cross_efficient_vit.pth"), map_location="cpu", weights_only=True)
    model.load_state_dict(state, strict=True)
    model.eval()
    _session = {"model": model, "torch": torch}
    return _session


def _prep(face_crop_rgb: np.ndarray) -> "torch.Tensor":
    """One RGB face crop -> padded 224px (3, 224, 224) tensor."""
    sess = _get_session()
    crop = cv2.cvtColor(face_crop_rgb, cv2.COLOR_RGB2BGR)
    ch, cw = crop.shape[:2]
    scale = 224 / max(ch, cw)
    resized = cv2.resize(crop, (max(1, int(cw * scale)), max(1, int(ch * scale))), interpolation=cv2.INTER_AREA)
    out = np.zeros((224, 224, 3), dtype=np.float32)
    rh, rw = resized.shape[:2]
    out[(224 - rh) // 2:(224 - rh) // 2 + rh, (224 - rw) // 2:(224 - rw) // 2 + rw] = resized
    return sess["torch"].from_numpy(out.transpose(2, 0, 1))


def _sigmoid(float_value: float) -> float:
    return float(1.0 / (1.0 + np.exp(-float_value)))


def cev_prob(face_crop_rgb: np.ndarray) -> float:
    """Fake probability for one RGB face crop (any resolution)."""
    return cev_probs([face_crop_rgb])[0]


def cev_probs(face_crops_rgb: list[np.ndarray]) -> list[float]:
    """Fake probabilities for a batch of RGB face crops in one forward pass.

    One batched forward over all sampled frames is several times faster than
    per-crop calls on CPU and numerically equivalent in eval mode.
    """
    if not face_crops_rgb:
        return []
    sess = _get_session()
    tensor = sess["torch"].stack([_prep(c) for c in face_crops_rgb])
    with sess["torch"].inference_mode():
        logits = sess["model"](tensor).reshape(-1)
    return [_sigmoid(float(v)) for v in logits]


def aggregate(probs: list[float]) -> Optional[dict]:
    if len(probs) < 5:
        return None
    a = np.array(probs, dtype=np.float64)
    return {
        "mean": round(float(a.mean()), 4),
        "max": round(float(a.max()), 4),
        "fracHigh": round(float((a >= 0.5).mean()), 4),
        "framesChecked": len(probs),
    }
