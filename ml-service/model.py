# ResNeXt50_32x4d + LSTM deepfake video classifier.
#
# Architecture and class mapping are ported verbatim from the pre-trained
# model in https://github.com/abhijithjadhav/Deepfake_detection_using_deep_learning
# (Django Application/ml_app/views.py). Weight files are named
# model_{acc}_acc_{frames}_frames_final_data.pt and trained on FaceForensics++.
#
# Class indices: 0 = FAKE, 1 = REAL (see predict(): "REAL" if prediction == 1).

from typing import Optional

import numpy as np
import torch
import torch.nn as nn
from torchvision import models, transforms

IM_SIZE = 112
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]

# Same normalization pipeline as the repo's train_transforms.
TRANSFORM = transforms.Compose(
    [
        transforms.ToPILImage(),
        transforms.Resize((IM_SIZE, IM_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ]
)


class DeepfakeModel(nn.Module):
    """ResNeXt50 feature extractor + LSTM classifier (repo architecture)."""

    def __init__(
        self,
        num_classes: int = 2,
        latent_dim: int = 2048,
        lstm_layers: int = 1,
        hidden_dim: int = 2048,
        bidirectional: bool = False,
    ):
        super().__init__()
        # weights=None: the full state dict comes from the .pt checkpoint.
        backbone = models.resnext50_32x4d(weights=None)
        self.model = nn.Sequential(*list(backbone.children())[:-2])
        self.lstm = nn.LSTM(latent_dim, hidden_dim, lstm_layers, bidirectional)
        self.relu = nn.LeakyReLU()
        self.dp = nn.Dropout(0.4)
        self.linear1 = nn.Linear(2048, num_classes)
        self.avgpool = nn.AdaptiveAvgPool2d(1)

    def forward(self, x):
        batch_size, seq_length, c, h, w = x.shape
        x = x.view(batch_size * seq_length, c, h, w)
        fmap = self.model(x)
        x = self.avgpool(fmap)
        x = x.view(batch_size, seq_length, 2048)
        x_lstm, _ = self.lstm(x, None)
        return fmap, self.dp(self.linear1(x_lstm[:, -1, :]))


def load_model(weights_path: str) -> DeepfakeModel:
    model = DeepfakeModel(2)
    state = torch.load(weights_path, map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.eval()
    return model


@torch.inference_mode()
def predict_video(model: DeepfakeModel, frames: list[np.ndarray]) -> dict:
    """Run the sequence model over preprocessed frames.

    Returns the aggregate fake/real probabilities, per-timestep fake scores,
    windowed sequence verdicts (3 contiguous windows - robust on edited
    videos with speaker cuts, closer to the 20-frame sequences the model was
    trained on) and a Grad-CAM overlay of the last frame.

    The ResNeXt backbone runs exactly once; per-timestep scores and windowed
    verdicts reuse its feature maps. Eval-mode inference is deterministic, so
    the numbers are identical to recomputing the CNN per pass at a third of
    the CPU time.
    """
    tensors = torch.stack([TRANSFORM(frame) for frame in frames]).unsqueeze(0)

    fmap, logits = model(tensors)
    softmax = nn.Softmax(dim=1)
    probs = softmax(logits)[0]
    fake_prob = float(probs[0])
    real_prob = float(probs[1])
    predicted = int(torch.argmax(logits, dim=1).item())

    # Per-timestep scores: the LSTM output at every step, classified.
    n = tensors.shape[1]
    pooled = model.avgpool(fmap).view(1, n, 2048)
    x_lstm, _ = model.lstm(pooled, None)
    step_logits = model.linear1(x_lstm[0])
    frame_scores = [float(p[0]) for p in softmax(step_logits)]

    # Windowed sequence verdicts: the single 60-frame pass collapses onto the
    # final timestep, which is unreliable on videos with speaker cuts. Only
    # the LSTM reruns per window - pooling was already done for the whole
    # sequence above.
    window_probabilities: list[float] = []
    wsize = max(10, n // 3)
    for start in range(0, n - wsize + 1, wsize):
        w_out, _ = model.lstm(pooled[:, start : start + wsize], None)
        window_probabilities.append(float(softmax(model.linear1(w_out[:, -1, :]))[0][0]))

    # Grad-CAM of the predicted class on the last frame (repo plot_heat_map):
    # linear-combine the last conv feature map with the classifier weights.
    weight_softmax = model.linear1.weight.detach().cpu().numpy()
    cam_idx = predicted
    fmap_last = fmap[-1].detach().cpu().numpy()  # [channels, h, w]
    nc, h, w = fmap_last.shape
    cam = np.dot(fmap_last.reshape((nc, h * w)).T, weight_softmax[cam_idx, :].T)
    cam = cam.reshape(h, w)
    cam = (cam - np.min(cam)) / (np.max(cam) - np.min(cam) + 1e-8)
    cam = np.uint8(255 * cam)

    return {
        "fakeProbability": fake_prob,
        "realProbability": real_prob,
        "prediction": "REAL" if predicted == 1 else "FAKE",
        "confidence": round(max(fake_prob, real_prob) * 100, 1),
        "frameScores": frame_scores,
        "windowProbabilities": window_probabilities,
        "cam": cam,
    }
