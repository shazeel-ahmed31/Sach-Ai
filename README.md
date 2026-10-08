# Sach-AI

A local research prototype for video deepfake detection, with authentication, scan history, batch uploads, frame scores and Grad-CAM visualizations.

**Release status:** source-code research release. Scores are experimental, are not calibrated probabilities of authenticity, and need human review. No end-to-end accuracy claim is made. Audio analysis is not implemented.

## Requirements

- Node.js **22.13+**, preferably Node 22 LTS. The API uses `node:sqlite`; Node 20 is unsupported.
- Python 3.11–3.13 and several GB of free space for PyTorch and separately acquired weights.
- npm is the supported package manager; npm lockfiles define installations.

| Service | Technology | Development address |
| --- | --- | --- |
| Frontend | React, Vite, TypeScript | http://localhost:8080 |
| API | Express, SQLite | http://127.0.0.1:8787 |
| Inference | FastAPI, PyTorch, OpenCV, ONNX Runtime | http://127.0.0.1:8600 |

## Windows setup

```powershell
git clone https://github.com/abdullahhhh-n/Sach-AI.git
cd Sach-AI
npm.cmd ci
npm.cmd --prefix server ci
Copy-Item server/.env.example server/.env
python -m venv ml-service/.venv
ml-service\.venv\Scripts\python.exe -m pip install --upgrade pip
ml-service\.venv\Scripts\python.exe -m pip install -r ml-service/requirements.txt
```

Generate a secret and set `JWT_SECRET` in `server/.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Development can start without a configured secret, using a new random key at each restart; existing access tokens then become invalid. Production requires a random secret of at least 32 characters. Never place secrets in `VITE_*` variables.

## macOS / Linux setup

```sh
git clone https://github.com/abdullahhhh-n/Sach-AI.git
cd Sach-AI
npm ci
npm --prefix server ci
cp server/.env.example server/.env
python3 -m venv ml-service/.venv
ml-service/.venv/bin/python -m pip install --upgrade pip
ml-service/.venv/bin/python -m pip install -r ml-service/requirements.txt
```

Generate `JWT_SECRET` with the same Node command above.

## Model setup

Weights are **not distributed here**. Create `ml-service/models/` and obtain compatible weights from the original publishers. Review weight and dataset terms before use or redistribution.

| File | Role / source |
| --- | --- |
| `model_97_acc_60_frames_FF_data.pt` | Required for the default 60-frame configuration; [ResNeXt + LSTM upstream](https://github.com/abhijithjadhav/Deepfake_detection_using_deep_learning). Its filename is an upstream checkpoint label, not measured Sach-AI accuracy. |
| `community_forensics_vit.onnx` | Optional generalist; requires a compatible ONNX export with `pixel_values` input and single-logit output. |
| `cross_efficient_vit.pth` | Optional CrossEfficientViT; [original architecture/checkpoint instructions](https://github.com/davide-coccomini/Combining-EfficientNet-and-Vision-Transformers-for-Video-Deepfake-Detection). |
| `face_detection_yunet_2023mar.onnx` | Optional [OpenCV Zoo YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet); otherwise Haar face detection is used. |

Set `SEQUENCE_LENGTH` in `server/.env` to match your sequence checkpoint. Optional models add signals; health reports their availability. Models are not downloaded automatically.

## Run

```powershell
npm.cmd run dev:all
```

On macOS/Linux use `npm run dev:all`. Open http://localhost:8080 and register your own account. No default account is seeded. Stop services with Ctrl+C.

```powershell
Invoke-RestMethod http://localhost:8787/api/health
```

Expect `engine.primary` to be `sach-model` when inference is reachable. Check `engine.model.weights` for a matching sequence checkpoint and `engine.model.signals` for optional detectors. A reachable service alone does not guarantee a usable model. Missing inference or weights causes failed scans without fabricated verdicts.

For UI development only, `ALLOW_DEMO_FALLBACK=true` enables a deterministic simulator when inference fails. Simulator scores do not analyze authenticity. Production rejects this setting. Sample reports are illustrative.

The API creates `server/data/sach.db`, storing accounts, token hashes and reports. Reports retain filenames and face thumbnails/heatmaps. Uploaded videos go to the configured inference service; temporary inference files are removed after each request. Deleting a scan or batch removes its reports. Environment files, databases, model weights and temporary videos are ignored by Git.

## Checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd --prefix server run typecheck
npm.cmd run build
npm.cmd --prefix server run build
npm.cmd test
npm.cmd --prefix server test
```

CI repeats these checks and audits dependencies. Backend tests use an isolated database to cover authentication, account isolation, origins, password byte limits, production configuration and unavailable inference.

## Deployment scope

Publishing the source does not deploy a hosted service. This prototype has no worker queue, bounded API inference concurrency, password reset, email verification or production monitoring. Concurrent large uploads can exhaust memory; use it locally or in a controlled environment.

For a controlled deployment, build both JavaScript services, serve `dist/` with SPA fallback, and reverse-proxy `/api` under the same HTTPS origin. Set `NODE_ENV=production`, the exact `CLIENT_ORIGIN`, a random `JWT_SECRET`, and `HOST` explicitly. `TRUST_PROXY_HOPS` defaults to zero; configure it only for your trusted proxy topology. Keep inference private, enforce upload/concurrency limits at the proxy, and manage database access and backups. Vite development/preview servers are for development.

## Troubleshooting

### Transfer to USB, phone, or another computer

Copy one ZIP instead of the entire folder. Installed dependencies contain tens
of thousands of small files and can be recreated on the destination computer.

```powershell
python tools/pack_transfer.py
```

This creates and verifies `transfer/Sach-AI-transfer.zip`, retaining source,
Git history, model files, local settings, and a consistent snapshot of the
accounts/report database. It excludes installed libraries, generated builds,
caches, logs, temporary uploads, and `.ml-repo/` (the upstream reference copy).
The original project stays intact. Use another output filename for a later backup:

```powershell
python tools/pack_transfer.py --output transfer/Sach-AI-backup-2.zip
```

For a much smaller source copy without models, local settings, saved data, or
Git history, use `python tools/pack_transfer.py --source-only`. This produces
`transfer/Sach-AI-source.zip`. The full transfer ZIP contains personal settings
and data; keep it private.

Extract the ZIP on the destination computer and follow `TRANSFER-INSTRUCTIONS.txt`
and the setup instructions above. Recreate the Python environment and reinstall
JavaScript dependencies. A phone can store the ZIP; the app runs on a computer.

### Common problems

| Problem | Fix |
| --- | --- |
| PowerShell blocks `npm.ps1` | Use `npm.cmd`. |
| `node:sqlite` is unavailable | Install Node 22.13+ and reinstall with `npm ci`. |
| Inference is unavailable | Start ML and install matching sequence weights. |
| Virtual environment came from another PC | Recreate it; virtual environments are not portable. |
| Checkpoint fails to load | Use trusted weights matching the architecture. |
| First scan is slow | Models initialize on first use; CPU inference can take minutes. |

## Source and licensing

```text
src/           React frontend
server/        API, authentication, SQLite and reports
ml-service/    Local inference and model architectures
tools/         Evaluation scripts (some require local datasets)
```

The project is distributed under GPL-3.0, consistent with the upstream sequence-model code adapted in `ml-service/model.py`. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for original authors and separately licensed components. Weights and datasets are excluded. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
