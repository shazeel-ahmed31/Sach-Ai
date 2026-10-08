// Types mirrored from the Sach-AI backend (server/src/services/scan.service.ts,
// server/src/lib/report.ts). Keep in sync.

export type ScanVerdict = "Likely Real" | "Suspicious" | "High Risk Deepfake";
export type ScanStatus = "pending" | "processing" | "completed" | "failed";
export type ScanEngine = "sach-model" | "demo";

export type ScanReport = {
  fileName: string;
  probability: number;
  verdict: ScanVerdict;
  compressionRobustness: number;
  resolution: string;
  duration: string;
  thumbnail?: string;
  heatmap?: string;
  engine?: ScanEngine;
  model?: string;
  modelsInAgreement: string;
  consensus: {
    spatial: { score: number; status: "pass" | "warn" | "fail"; note: string };
    temporal: { score: number; status: "pass" | "warn" | "fail"; note: string };
    faceConsistency: { score: number; status: "pass" | "warn" | "fail"; note: string };
  };
  flags: string[];
};

export type ScanSummary = {
  id: string;
  batchId: string | null;
  batchLabel: string | null;
  position: number | null;
  fileName: string;
  fileSize: number | null;
  status: ScanStatus;
  engine: ScanEngine | null;
  probability: number | null;
  verdict: string | null;
  resolution: string | null;
  durationSec: number | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
};

export type ScanDetail = ScanSummary & {
  report: ScanReport | null;
  thumbnail: string | null;
  heatmap: string | null;
};

export type BatchSummary = {
  id: string;
  label: string;
  total: number;
  completed: number;
  failed: number;
  outstanding: number;
  createdAt: string;
};

export type BatchDetail = BatchSummary & { scans: ScanSummary[] };

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
};
