import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProbabilityGauge from "@/components/ProbabilityGauge";
import HeatmapDisplay from "@/components/HeatmapDisplay";
import ConsensusGrid from "@/components/ConsensusGrid";
import { sampleReport, type ScanReport } from "@/data/staticData";
import type { ScanReport as ApiScanReport } from "@/services/types";
import { api, ApiError } from "@/services/api";
import { AlertOctagon, FileVideo, Languages, Loader2, ShieldAlert } from "lucide-react";

const Report = () => {
  const location = useLocation();
  const [params] = useSearchParams();
  const scanId = params.get("scan");

  // A fresh scan passes its report through router state; history links pass
  // ?scan=<id> and we fetch it.
  const stateReport =
    (location.state as { report?: ApiScanReport } | null)?.report ?? undefined;

  const [fetched, setFetched] = useState<ApiScanReport | null>(null);
  const [loading, setLoading] = useState(Boolean(scanId && !stateReport));
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    if (!scanId || stateReport) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getScan(scanId)
      .then(({ scan }) => {
        if (cancelled) return;
        if (scan.report) setFetched(scan.report);
        else setError("This scan did not finish successfully - no report is available.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load this scan.",
        );
        setNeedsAuth(err instanceof ApiError && err.status === 401);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scanId, stateReport]);

  const isSample = !scanId && !stateReport;
  const r: ScanReport | null = stateReport ?? fetched ?? (isSample ? sampleReport : null);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container py-12">
        {isSample && (
          <p className="mb-6 rounded-lg border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            Sample report with illustrative scores. No video was analyzed.
          </p>
        )}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="font-mono text-xs text-muted-foreground">Loading scan report...</span>
          </div>
        )}

        {!loading && error && (
          <div className="mx-auto max-w-md rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">
              {needsAuth ? "Sign in to view this report" : "Report unavailable"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            {needsAuth ? (
              <Link
                to="/login"
                state={{ from: `/report?scan=${scanId}` }}
                className="mt-6 inline-flex items-center rounded-lg bg-gradient-emerald px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Sign in
              </Link>
            ) : (
              <Link
                to="/history"
                className="mt-6 inline-flex items-center rounded-lg bg-gradient-emerald px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Back to history
              </Link>
            )}
          </div>
        )}

        {!loading && !error && r && <ReportBody r={r} />}
      </main>
      <Footer />
    </div>
  );
};

const ReportBody = ({ r }: { r: ScanReport }) => (
  <>
    {/* Header */}
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-start justify-between gap-4 mb-10"
    >
      <div>
        <div className="text-xs font-mono text-primary uppercase tracking-[0.2em] mb-1">
          Truth Report · {r.engine === "demo" ? "Local Simulator" : "ResNeXt+LSTM"}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold break-all">{r.fileName}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-mono text-muted-foreground">
          <span className="rounded-md border border-border bg-card/60 px-2 py-1">
            <FileVideo className="inline h-3 w-3 mr-1" />
            {r.resolution}
          </span>
          <span className="rounded-md border border-border bg-card/60 px-2 py-1">
            duration {r.duration}
          </span>
          {r.model && (
            <span className="rounded-md border border-border bg-card/60 px-2 py-1 truncate max-w-[280px]">
              {r.model}
            </span>
          )}
        </div>
      </div>
    </motion.div>

    {/* Verdict + Gauge + Analyzed frame / heatmap */}
    <div className="grid lg:grid-cols-2 gap-6 mb-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-destructive/30 bg-card/80 p-8 flex flex-col items-center justify-center"
      >
        <ProbabilityGauge value={r.probability} />
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-destructive/15 border border-destructive/40 px-4 py-1.5 text-destructive text-sm font-semibold">
          <AlertOctagon className="h-4 w-4" />
          Verdict: {r.verdict}
        </div>
        <div className="mt-6 w-full grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg border border-border bg-secondary/40 p-3">
            <div className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">
              Frame Score Consistency
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-primary">
              {r.compressionRobustness}%
            </div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/40 p-3">
            <div className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">
              Models in Agreement
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-destructive">
              {r.modelsInAgreement}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {!r.thumbnail && !r.heatmap ? (
          <HeatmapDisplay />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-10 rounded-2xl border border-border bg-card/60 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                {r.heatmap ? "Grad-CAM · model attention" : "Analyzed Frame"}
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{r.fileName}</span>
            </div>
            <img
              src={r.heatmap ?? r.thumbnail}
              alt={r.heatmap ? "Grad-CAM attention overlay of the analyzed frame" : "Captured frame from the uploaded video"}
              className="w-full h-auto max-h-[420px] object-contain bg-black"
            />
          </motion.div>
        )}
      </motion.div>
    </div>

    {/* Flags */}
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="mb-10 flex flex-wrap gap-2"
    >
      {r.flags.map((f) => {
        const isPhoneme = f.toLowerCase().includes("phoneme") || f.toLowerCase().includes("sync");
        return (
          <span
            key={f}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-mono border
            ${isPhoneme
              ? "bg-destructive/10 border-destructive/40 text-destructive"
              : "bg-secondary border-border text-foreground"
            }`}
          >
            {isPhoneme && <Languages className="h-3 w-3" />}
            {f}
          </span>
        );
      })}
    </motion.div>

    {/* Consensus */}
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="mb-4">
        <div className="text-xs font-mono text-primary uppercase tracking-[0.2em]">
          The three checks
        </div>
        <h2 className="text-2xl font-bold mt-1">Why we picked this answer</h2>
      </div>
      <ConsensusGrid consensus={r.consensus} />
    </motion.div>

    {/* Tech details */}
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="mt-10 rounded-2xl border border-border bg-card/60 p-6"
    >
      <h3 className="font-semibold mb-3">About this check</h3>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm font-mono">
        {[
          ["Picture check", "Face crops scored per frame"],
          ["Motion check", "LSTM over the sampled sequence"],
          ["Swap check", "Face vs surroundings texture match"],
          ["Model family", "FaceForensics++ sequence detector"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-secondary/30 p-3">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className="mt-1 text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </motion.div>

    {r.engine === "demo" && (
      <p className="mt-6 text-center text-xs font-mono text-muted-foreground">
        This report contains simulated scores and does not assess video authenticity.
        Start <code className="text-primary">ml-service/</code> and rescan for real model output.
      </p>
    )}
  </>
);

export default Report;
