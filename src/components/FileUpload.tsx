import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileVideo, X, CheckCircle2, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ScanDetail } from "@/services/types";

const STAGES = [
  "Uploading video to your server...",
  "Decoding and sampling frames...",
  "Detecting and cropping faces...",
  "Running ResNeXt+LSTM inference...",
  "Compiling Truth Report...",
];

const formatDuration = (sec: number) => {
  if (!isFinite(sec) || sec <= 0) return "00:00";
  const total = Math.round(sec);
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
};

/** XHR (not fetch) so we get real upload progress events. */
const uploadVideo = (
  file: File,
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
): Promise<ScanDetail> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/scans");
    xhr.responseType = "json";
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.onload = () => {
      signal.removeEventListener("abort", onAbort);
      const body = xhr.response as { scan?: ScanDetail; error?: { message?: string } } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.scan) {
        resolve(body.scan);
      } else {
        reject(new Error(body?.error?.message ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error("Cannot reach the Sach-AI server. Is it running?"));
    };
    const form = new FormData();
    form.append("video", file);
    xhr.send(form);
  });

const FileUpload = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [scanLine, setScanLine] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [videoMeta, setVideoMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Animated scan line for the AI processing overlay
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setScanLine((s) => (s + 2) % 100), 30);
    return () => clearInterval(id);
  }, [running]);

  // Live preview of the uploaded video while the backend works
  useEffect(() => {
    if (!running || !videoRef.current || !videoMeta) return;
    const video = videoRef.current;
    video.muted = true;
    video.playbackRate = Math.max(0.75, Math.min(2.5, (videoMeta.duration || 6) / 6));
    video.play().catch(() => {});
  }, [running, videoMeta]);

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFile(null);
    setRunning(false);
    setProgress(0);
    setStageIdx(0);
    setElapsedSec(0);
    setVideoMeta(null);
    setError(null);
  };

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const startScan = (f: File) => {
    reset();
    objectUrlRef.current = URL.createObjectURL(f);
    setFile(f);
    setRunning(true);
    setElapsedSec(0);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    uploadVideo(
      f,
      (uploadRatio) => {
        // Upload is the first 45% of the bar; the rest crawls while the
        // server samples frames and runs inference.
        setProgress((p) => Math.max(p, Math.min(45, Math.round(uploadRatio * 45))));
      },
      controller.signal,
    )
      .then((scan) => {
        if (controller.signal.aborted) return;
        setProgress(100);
        setTimeout(() => {
          navigate("/report", { state: { report: scan.report, scanId: scan.id } });
        }, 450);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Analysis failed.");
        setRunning(false);
      });
  };

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    startScan(f);
  };

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setVideoMeta({ duration: v.duration, width: v.videoWidth, height: v.height });
  };

  // Derive the visible stage from overall progress.
  useEffect(() => {
    if (progress >= 100) setStageIdx(STAGES.length - 1);
    else if (progress >= 88) setStageIdx(3);
    else if (progress >= 46) setStageIdx(2);
    else setStageIdx(progress > 2 ? 1 : 0);
  }, [progress]);

  // While the server runs inference there is no progress event to listen to,
  // so the bar creeps: linearly to 92% for quick feedback, then asymptotically
  // toward 97% so it keeps moving instead of freezing at a fixed number. The
  // elapsed counter is the honest signal of how long the models have run.
  useEffect(() => {
    if (!running || error) return;
    const creep = setInterval(() => {
      setProgress((p) => {
        if (p < 45 || p >= 97) return p; // upload drives < 45; 100 set on completion
        if (p < 92) return p + 1;
        return p + Math.max(0.15, (97 - p) * 0.03);
      });
    }, 900);
    const tick = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => {
      clearInterval(creep);
      clearInterval(tick);
    };
  }, [running, error]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <AnimatePresence mode="wait">
        {!file && (
          <motion.div
            key="drop"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all
              ${dragOver ? "border-primary bg-primary/5 glow-emerald" : "border-border bg-card/40 hover:border-primary/50"}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-emerald glow-emerald">
              <Upload className="h-7 w-7 text-primary-foreground" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Drop a video to verify</h3>
            <p className="text-muted-foreground mb-4">
              MP4, MOV, WebM up to 200 MB.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-4 py-1.5 text-xs font-mono text-muted-foreground">
              or click anywhere in this box
            </div>
          </motion.div>
        )}

        {file && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-primary/30 bg-card/80 p-8 scanline"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileVideo className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-semibold truncate max-w-[260px] sm:max-w-md">
                    {file.name}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                    {videoMeta ? ` · ${videoMeta.width}x${videoMeta.height} · ${formatDuration(videoMeta.duration)}` : ""}
                  </div>
                </div>
              </div>
              <button
                onClick={reset}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Live processing preview using the video itself */}
            <div className="relative mb-6 aspect-video w-full overflow-hidden rounded-xl border border-primary/30 bg-black">
              <video
                ref={videoRef}
                src={objectUrlRef.current ?? undefined}
                onLoadedMetadata={onLoadedMetadata}
                playsInline
                muted
                loop
                className="absolute inset-0 h-full w-full object-contain"
              />

              {/* Scanning line overlay */}
              <div
                className="pointer-events-none absolute inset-x-0 h-[2px] bg-primary/80 shadow-[0_0_18px_4px_hsl(var(--primary))]"
                style={{ top: `${scanLine}%` }}
              />
              {/* Grid overlay */}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_95%,rgba(0,255,170,0.18)_95%),linear-gradient(90deg,transparent_95%,rgba(0,255,170,0.18)_95%)] bg-[size:32px_32px] mix-blend-screen" />
              {/* Corner brackets */}
              <div className="pointer-events-none absolute left-2 top-2 h-5 w-5 border-l-2 border-t-2 border-primary" />
              <div className="pointer-events-none absolute right-2 top-2 h-5 w-5 border-r-2 border-t-2 border-primary" />
              <div className="pointer-events-none absolute bottom-2 left-2 h-5 w-5 border-b-2 border-l-2 border-primary" />
              <div className="pointer-events-none absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2 border-primary" />
              {/* HUD text */}
              <div className="pointer-events-none absolute left-3 top-3 right-3 flex justify-between font-mono text-[10px] text-primary/90">
                <span>AI ANALYSIS IN PROGRESS</span>
                <span>RESNEXT+LSTM</span>
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex justify-between font-mono text-[10px] text-primary/90">
                <span>{STAGES[stageIdx]}</span>
                <span>{Math.floor(progress)}%</span>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-mono text-primary">
                {progress < 100 ? STAGES[stageIdx] : "Analysis complete"}
              </span>
              <span className="font-mono text-muted-foreground">
                {Math.floor(progress)}%
                {progress > 0 && progress < 100 ? ` · ${formatDuration(elapsedSec)} elapsed` : ""}
              </span>
            </div>

            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full bg-gradient-emerald"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-2">
              {STAGES.map((s, i) => (
                <div
                  key={s}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] font-mono transition-colors
                    ${
                      i < stageIdx
                        ? "border-primary/40 bg-primary/5 text-primary"
                        : i === stageIdx
                        ? "border-primary bg-primary/10 text-primary animate-pulse-glow"
                        : "border-border text-muted-foreground"
                    }`}
                >
                  {i < stageIdx ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                  )}
                  <span className="truncate">Stage {i + 1}</span>
                </div>
              ))}
            </div>

            {progress >= 100 && !error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-center text-sm text-primary font-mono"
              >
                Redirecting to your Truth Report...
              </motion.p>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 flex items-start justify-between gap-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs font-mono text-destructive"
              >
                <span>Scan error: {error}</span>
                <button
                  onClick={() => startScan(file)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 px-2 py-1 hover:bg-destructive/10"
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FileUpload;
