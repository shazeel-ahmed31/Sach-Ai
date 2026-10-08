import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { History as HistoryIcon, Layers, Loader2, Search, Trash2, FileVideo, ScanSearch, ChevronRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { api, ApiError } from "@/services/api";
import type { BatchSummary, ScanSummary } from "@/services/types";

const verdictBadge = (verdict: string | null) => {
  switch (verdict) {
    case "High Risk Deepfake":
      return "bg-destructive/15 border-destructive/40 text-destructive";
    case "Suspicious":
      return "bg-amber-500/10 border-amber-500/40 text-amber-500";
    case "Likely Real":
      return "bg-primary/10 border-primary/40 text-primary";
    default:
      return "bg-secondary border-border text-muted-foreground";
  }
};

const statusBadge = (status: ScanSummary["status"]) => {
  switch (status) {
    case "completed":
      return "bg-primary/10 border-primary/30 text-primary";
    case "failed":
      return "bg-destructive/10 border-destructive/30 text-destructive";
    case "processing":
      return "bg-amber-500/10 border-amber-500/30 text-amber-500 animate-pulse";
    default:
      return "bg-secondary border-border text-muted-foreground";
  }
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const History = () => {
  const navigate = useNavigate();
  const [scans, setScans] = useState<ScanSummary[] | null>(null);
  const [batches, setBatches] = useState<BatchSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const [scanRes, batchRes] = await Promise.all([
        api.listScans({ search: q || undefined, limit: 50 }),
        api.listBatches(),
      ]);
      setScans(scanRes.scans);
      setBatches(batchRes.batches);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load history.");
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  // Debounced search
  useEffect(() => {
    if (search === "") return;
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const deleteScan = async (id: string) => {
    await api.deleteScan(id).catch(() => {});
    setScans((s) => s?.filter((x) => x.id !== id) ?? null);
  };

  const openScan = (scan: ScanSummary) => {
    if (scan.status !== "completed") {
      navigate(`/batch/${scan.batchId ?? ""}`);
      return;
    }
    navigate(`/report?scan=${scan.id}`);
  };

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
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-mono text-primary mb-3">
                <HistoryIcon className="h-3.5 w-3.5" />
                Your account
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">
                Scan <span className="text-gradient-emerald">History</span>
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Every video you have verified, with its verdict and full Truth Report.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search file name..."
                className="w-full rounded-lg border border-border bg-card/60 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs font-mono text-destructive">
              {error}
            </div>
          )}

          {scans === null ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Batches */}
              {batches && batches.length > 0 && (
                <section className="mb-10">
                  <h2 className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
                    <Layers className="h-4 w-4 text-primary" /> Batch scans
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {batches.map((b) => (
                      <Link
                        key={b.id}
                        to={`/batch/${b.id}`}
                        className="group rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/40"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{b.label}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs font-mono">
                          <span className="text-muted-foreground">
                            {formatDate(b.createdAt)}
                          </span>
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
                            {b.completed}/{b.total} done
                          </span>
                          {b.failed > 0 && (
                            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-destructive">
                              {b.failed} failed
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Individual scans */}
              <section>
                <h2 className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
                  <FileVideo className="h-4 w-4 text-primary" /> Scans                </h2>
                {scans.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
                    <ScanSearch className="mx-auto h-10 w-10 text-muted-foreground" />
                    <h3 className="mt-4 font-semibold">
                      {search ? "No scans match that search" : "No scans yet"}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {search
                        ? "Try a different file name."
                        : "Verify your first video and it will show up here."}
                    </p>
                    {!search && (
                      <div className="mt-6 flex justify-center gap-3">
                        <Link
                          to="/detect"
                          className="rounded-lg bg-gradient-emerald px-4 py-2 text-sm font-semibold text-primary-foreground"
                        >
                          Verify a video
                        </Link>
                        <Link
                          to="/batch"
                          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-primary/40"
                        >
                          Batch scan
                        </Link>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {scans.map((s, i) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                        className="group flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3.5 transition-colors hover:border-primary/40"
                      >
                        <button
                          onClick={() => openScan(s)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <FileVideo className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-medium">{s.fileName}</span>
                              {s.batchLabel && (
                                <span className="hidden sm:inline shrink-0 rounded-full bg-secondary border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                                  {s.batchLabel}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs font-mono text-muted-foreground">
                              {formatDate(s.createdAt)}
                              {s.durationSec ? ` · ${Math.round(s.durationSec)}s` : ""}
                              {s.resolution ? ` · ${s.resolution}` : ""}
                            </span>
                          </span>
                        </button>

                        <span
                          className={`hidden sm:inline shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-mono ${statusBadge(s.status)}`}
                        >
                          {s.status}
                        </span>
                        {s.status === "completed" && (
                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-mono ${verdictBadge(s.verdict)}`}
                          >
                            {s.probability}% {s.verdict}
                          </span>
                        )}

                        <button
                          onClick={() => deleteScan(s.id)}
                          aria-label={`Delete scan of ${s.fileName}`}
                          className="shrink-0 rounded-md p-2 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default History;
