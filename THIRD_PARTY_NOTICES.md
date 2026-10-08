# Third-party notices

The project-level GPL-3.0 license does not replace separately licensed components' notices.

## ResNeXt50 + LSTM

- Upstream: https://github.com/abhijithjadhav/Deepfake_detection_using_deep_learning
- Author: Abhijith Jadhav and contributors.
- License: GPL-3.0; full text in `LICENSE`.
- `ml-service/model.py` adapts the architecture and class mapping from `Django Application/ml_app/views.py`.
- Sach-AI changes include local HTTP integration, preprocessing, windowed scoring, per-frame scoring and Grad-CAM output. Adaptations are provided in source form. Release preparation updated 2026-10-04.

## CrossEfficientViT

- Upstream: https://github.com/davide-coccomini/Combining-EfficientNet-and-Vision-Transformers-for-Video-Deepfake-Detection
- Copyright (c) 2022 Davide Coccomini.
- License: MIT; full original notice in `ml-service/cevit/LICENSE`.
- Included source: `ml-service/cevit/cross_efficient_vit.py`.
- Sach-AI's wrapper, `ml-service/cevit_detector.py`, configures the model, batches crops and loads a local checkpoint.

## EfficientNet-PyTorch

- Upstream: https://github.com/lukemelas/EfficientNet-PyTorch
- Included through the CrossEfficientViT checkout under `ml-service/cevit/efficient_net/`.
- License: Apache-2.0; notice and license retained in that directory's `LICENSE` and source headers.

## Dependencies and assets

npm/Python packages retain their own licenses. Weights and datasets are not included and are not covered by the project license. FaceForensics++, Community Forensics and YuNet refer to external research/resources. Static UI examples and simulator scores are illustrative, not evaluation results. Project images have no additional provenance metadata in this checkout.
