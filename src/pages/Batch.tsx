import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  X,
  XCircle,
  FileVideo,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { api } from "@/services/api";
import type { BatchDetail, ScanDetail } from "@/services/types";

type QueueItem = {
  key: string;
  file: File;
  scanId: string | null;
  status: "queued" | "working" | "completed" | "failed";
  progress: number;
  result?: ScanDetail;
  error?: string;
};

const formatSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const uploadBatchItem = (
  batchId: string,
  scanId: string,
  file: File,
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
): Promise<ScanDetail> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/batches/${batchId}/scans/${scanId}`);
    xhr.responseType = "json";
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("cancelled", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.onload = () => {
      signal.removeEventListener("abort", onAbort);
      const body = xhr.response as { scan?: ScanDetail; error?: { message?: string } } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.scan) resolve(body.scan);
      else reject(new Error(body?.error?.message ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error("Cannot reach the Sach-AI server."));
    };
    const form = new FormData();
    form.append("video", file);
    xhr.send(form);
  });

const BatchPage = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [error, setError] = useState<string | null>(null);

  const updateItem = (key: string, patch: Partial<QueueItem>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const runQueue = useCallback(
    async (queue: QueueItem[], batchId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase("running");
      const creepTimers = new Map<string, ReturnType<typeof setInterval>>();
      const stopCreep = (key: string) => {
        const t = creepTimers.get(key);
        if (t) clearInterval(t);
        creepTimers.delete(key);
      };

      // Sequential: the model is CPU-bound and the service serializes
      // inference anyway, so one clear progress bar per file beats racing.
      for (const item of queue) {
        if (controller.signal.aborted) break;
        try {
          updateItem(item.key, { status: "working", progress: 2 });
          // Upload events drive the bar to 60%; after that inference has no
          // progress events, so creep toward 95% instead of freezing.
          let creepValue = 2;
          const creep = setInterval(() => {
            creepValue =
              creepValue < 60 ? creepValue + 1 : creepValue + Math.max(0.2, (95 - creepValue) * 0.02);
            if (creepValue < 95) updateItem(item.key, { progress: Math.min(95, Math.round(creepValue)) });
          }, 900);
          creepTimers.set(item.key, creep);
          const result = await uploadBatchItem(
            batchId,
            item.scanId!,
            item.file,
            (r) =>
              updateItem(item.key, {
                progress: Math.max(Math.min(95, Math.round(creepValue)), Math.min(60, Math.round(r * 60))),
              }),
            controller.signal,
          );
          stopCreep(item.key);
          updateItem(item.key, {
            status: result.status === "failed" ? "failed" : "completed",
            progress: 100,
            result,
            error: result.status === "failed" ? result.error ?? "Analysis failed" : undefined,
          });
        } catch (err) {
          stopCreep(item.key);
          if (err instanceof DOMException && err.name === "AbortError") {
            updateItem(item.key, { status: "failed", error: "Cancelled" });
          } else {
            updateItem(item.key, {
              status: "failed",
              error: err instanceof Error ? err.message : "Upload failed",
            });
          }
        }
      }
      if (!controller.signal.aborted) setPhase("done");
    },
    [],
  );

  const start = async () => {
    if (files.length === 0) return;
    setError(null);
    try {
      const { batch, scans } = await api.createBatch(
        label,
        files.map((f) => ({ fileName: f.name, fileSize: f.size })),
      );
      const queue: QueueItem[] = files.map((f, i) => ({
        key: `${f.name}-${i}`,
        file: f,
        scanId: scans[i]?.id ?? null,
        status: "queued",
        progress: 0,
      }));
      setItems(queue);
      void runQueue(queue, batch.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the batch");
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase("done");
  };

  const reset = () => {
    abortRef.current?.abort();
    setFiles([]);
    setItems([]);
    setLabel("");
    setPhase("setup");
    setError(null);
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((cur) => [...cur, ...Array.from(incoming)].slice(0, 25));
  };

  const completed = items.filter((i) => i.status === "completed");
  const failed = items.filter((i) => i.status === "failed");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-mono text-primary mb-4">
              <Layers className="h-3.5 w-3.5" />
              Batch Scan
            </div>
            <h1 className="text-4xl md:text-5xl font-bold">
              Verify many videos <span className="text-gradient-emerald">at once</span>
            </h1>
            <p className="mt-3 text-muted-foreground">
              Queue up to 25 clips. Each one runs through the same ResNeXt+LSTM model,
              and every result lands in your scan history.
            </p>
          </div>

          {phase === "setup" && (
            <div className="rounded-2xl border border-primary/30 bg-card/80 p-8">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all ${
                  dragOver ? "border-primary bg-primary/5 glow-emerald" : "border-border bg-card/40 hover:border-primary/50"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-emerald glow-emerald">
                  <Layers className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-bold">Drop videos here</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  MP4, MOV, WebM · up to 25 files · 200 MB each
                </p>
              </div>

              {files.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{files.length} file(s) selected</span>
                    <button
                      onClick={() => setFiles([])}
                      className="text-xs font-mono text-muted-foreground hover:text-destructive"
                    >
                      clear all
                    </button>
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                    {files.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
                      >
                        <FileVideo className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatSize(f.size)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFiles((cur) => cur.filter((_, j) => j !== i));
                          }}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${f.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder={`Batch ${new Date().toLocaleDateString()}`}
                      className="flex-1 rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                    />
                    <button
                      onClick={start}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-emerald px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant transition-transform hover:scale-[1.02]"
                    >
                      <Play className="h-4 w-4" /> Start batch scan
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs font-mono text-destructive">
                  {error}
                </div>
              )}
            </div>
          )}

          {(phase === "running" || phase === "done") && (
            <div className="rounded-2xl border border-primary/30 bg-card/80 p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-lg">
                    {phase === "running" ? "Scanning in progress" : "Batch finished"}
                  </h2>
                  <p className="text-xs font-mono text-muted-foreground">
                    {completed.length} completed · {failed.length} failed ·{" "}
                    {items.length - completed.length - failed.length} remaining
                  </p>
                </div>
                <div className="flex gap-2">
                  {phase === "running" ? (
                    <button
                      onClick={cancel}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:border-destructive/40 hover:text-destructive"
                    >
                      <X className="h-4 w-4" /> Cancel
                    </button>
                  ) : (
                    <button
                      onClick={reset}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-emerald px-3.5 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      <RotateCcw className="h-4 w-4" /> New batch
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                {items.map((item) => (
                  <motion.div
                    key={item.key}
                    layout
                    className="rounded-xl border border-border bg-card/60 p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <StatusIcon item={item} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{item.file.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {formatSize(item.file.size)}
                          </span>
                        </div>
                        {item.status === "working" && (
                          <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-emerald"
                              animate={{ width: `${item.progress}%` }}
                            />
                          </div>
                        )}
                        {item.status === "failed" && (
                          <p className="mt-1 text-xs font-mono text-destructive">{item.error}</p>
                        )}
                      </div>
                      {item.status === "completed" && item.result?.report && (
                        <span className="shrink-0 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-mono text-destructive">
                          {item.result.report.probability}% {item.result.report.verdict}
                        </span>
                      )}
                      {item.status === "completed" && (
                        <button
                          onClick={() => navigate(`/report?scan=${item.result!.id}`)}
                          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
                        >
                          Report <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              <AnimatePresence>
                {phase === "done" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 flex flex-wrap justify-center gap-3 border-t border-border pt-5"
                  >
                    <Link
                      to="/history"
                      className="rounded-lg bg-gradient-emerald px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      View all in history
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

const StatusIcon = ({ item }: { item: QueueItem }) => {
  if (item.status === "completed")
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />;
  if (item.status === "failed") return <XCircle className="h-5 w-5 shrink-0 text-destructive" />;
  if (item.status === "working")
    return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />;
  return <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />;
};

/** Read-only status view of a previously created batch. */
export const BatchDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api
      .getBatch(id)
      .then(setBatch)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load this batch."),
      );
  }, [id]);

  useEffect(load, [load]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container py-12">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="mx-auto max-w-md rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center">
              <XCircle className="mx-auto h-10 w-10 text-destructive" />
              <h1 className="mt-4 text-xl font-bold">Batch unavailable</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <Link
                to="/history"
                className="mt-6 inline-flex items-center rounded-lg bg-gradient-emerald px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Back to history
              </Link>
            </div>
          )}

          {batch && (
            <>
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-mono text-primary mb-3">
                  <Layers className="h-3.5 w-3.5" /> Batch
                </div>
                <h1 className="text-3xl md:text-4xl font-bold">{batch.label}</h1>
                <p className="mt-2 text-sm font-mono text-muted-foreground">
                  {batch.completed}/{batch.total} completed · {batch.failed} failed
                </p>
              </div>

              <div className="space-y-2">
                {batch.scans.map((s) => (
                  <div
                    key={s.id}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3.5"
                  >
                    <StatusIcon
                      item={{
                        key: s.id,
                        file: { name: s.fileName, size: s.fileSize ?? 0 } as File,
                        scanId: s.id,
                        status:
                          s.status === "completed"
                            ? "completed"
                            : s.status === "failed"
                              ? "failed"
                              : "working",
                        progress: 0,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.fileName}</span>
                      {s.error && (
                        <span className="text-xs font-mono text-destructive">{s.error}</span>
                      )}
                    </div>
                    {s.status === "completed" && s.verdict && (
                      <span className="shrink-0 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-mono text-destructive">
                        {s.probability}% {s.verdict}
                      </span>
                    )}
                    {s.status === "completed" && (
                      <button
                        onClick={() => navigate(`/report?scan=${s.id}`)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
                      >
                        Report <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={load}
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:border-primary/40"
              >
                <RotateCcw className="h-4 w-4" /> Refresh status
              </button>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default BatchPage;
