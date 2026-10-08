import { db, type BatchRow, type ScanRow } from "../db/index.js";
import { newId } from "../config.js";
import { AppError } from "../lib/errors.js";
import { analyzeVideo, type AnalyzeResult } from "../lib/engine.js";
import { buildScanReport, type ScanReport } from "../lib/report.js";

export type ScanStatus = "pending" | "processing" | "completed" | "failed";
export type ScanEngine = "sach-model" | "demo";

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

const nowIso = () => new Date().toISOString();

const resolutionOf = (row: ScanRow): string | null =>
  row.width && row.height ? `${row.width} x ${row.height}` : null;

const parseJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const toSummary = (row: ScanRow, batch?: BatchRow | null): ScanSummary => ({
  id: row.id,
  batchId: row.batch_id,
  batchLabel: batch?.label ?? null,
  position: row.position,
  fileName: row.file_name,
  fileSize: row.file_size,
  status: row.status,
  engine: row.engine,
  probability: row.probability,
  verdict: row.verdict,
  resolution: resolutionOf(row),
  durationSec: row.duration_sec,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  error: row.error,
});

export const toDetail = (row: ScanRow, batch?: BatchRow | null): ScanDetail => {
  const report = parseJson<ScanReport>(row.report_json);
  return {
    ...toSummary(row, batch),
    report,
    thumbnail: row.thumbnail ?? report?.thumbnail ?? null,
    heatmap: report?.heatmap ?? null,
  };
};

export const getScanRow = (userId: string, scanId: string): ScanRow | undefined =>
  db.prepare("SELECT * FROM scans WHERE id = ? AND user_id = ?").get(scanId, userId) as
    | ScanRow
    | undefined;

const batchById = (userId: string, batchId: string): BatchRow | undefined =>
  db.prepare("SELECT * FROM batches WHERE id = ? AND user_id = ?").get(batchId, userId) as
    | BatchRow
    | undefined;

const batchForScan = (userId: string, row: ScanRow): BatchRow | undefined =>
  row.batch_id ? batchById(userId, row.batch_id) : undefined;

const batchAggregate = (batch: BatchRow, scans: ScanRow[]): BatchSummary => ({
  id: batch.id,
  label: batch.label,
  total: batch.total,
  completed: scans.filter((s) => s.status === "completed").length,
  failed: scans.filter((s) => s.status === "failed").length,
  outstanding: scans.filter((s) => s.status === "pending" || s.status === "processing").length,
  createdAt: batch.created_at,
});

// ---------------------------------------------------------------------------
// Running scans
// ---------------------------------------------------------------------------

export type VideoUpload = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

/**
 * Analyze one uploaded video and persist it as a scan. When `existingRow` is
 * given (batch item), that pending row is filled in instead of creating a
 * new standalone scan.
 */
export const runScan = async (
  userId: string,
  video: VideoUpload,
  refs: { batchId?: string | null; position?: number | null; existingRow?: ScanRow } = {},
): Promise<ScanDetail> => {
  let row: ScanRow;
  if (refs.existingRow) {
    row = refs.existingRow;
    db.prepare("UPDATE scans SET status = 'processing', error = NULL, file_size = ? WHERE id = ?").run(
      video.buffer.length,
      row.id,
    );
  } else {
    const id = newId("scn");
    db.prepare(
      `INSERT INTO scans (id, user_id, batch_id, position, file_name, file_size, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)`,
    ).run(id, userId, refs.batchId ?? null, refs.position ?? null, video.fileName, video.buffer.length, nowIso());
    row = getScanRow(userId, id)!;
  }

  try {
    const result: AnalyzeResult = await analyzeVideo(video);
    const built = buildScanReport({ fileName: video.fileName, result });
    const framesJson = JSON.stringify(
      result.frames.map((f) => ({ timestamp: f.timestamp, fakeScore: f.fakeScore })),
    );

    db.prepare(
      `UPDATE scans SET
         status = 'completed', engine = ?, model_name = ?, probability = ?, verdict = ?,
         duration_sec = ?, width = ?, height = ?, thumbnail = ?,
         report_json = ?, frames_json = ?, error = NULL, completed_at = ?
       WHERE id = ?`,
    ).run(
      result.engine,
      result.engine === "sach-model" ? result.model : null,
      built.probability,
      built.verdict,
      built.durationSec || null,
      built.width || null,
      built.height || null,
      built.thumbnail,
      JSON.stringify(built.report),
      framesJson,
      nowIso(),
      row.id,
    );
  } catch (err) {
    db.prepare("UPDATE scans SET status = 'failed', error = ?, completed_at = ? WHERE id = ?").run(
      err instanceof Error ? err.message : "Analysis failed",
      nowIso(),
      row.id,
    );
  }

  return toDetail(getScanRow(userId, row.id)!, batchForScan(userId, row));
};

// ---------------------------------------------------------------------------
// History queries
// ---------------------------------------------------------------------------

export type ListScansOptions = {
  search?: string;
  batchId?: string;
  verdict?: string;
  limit: number;
  offset: number;
};

export const listScans = (
  userId: string,
  opts: ListScansOptions,
): { scans: ScanSummary[]; total: number } => {
  const where: string[] = ["s.user_id = ?"];
  const params: (string | number | null)[] = [userId];

  if (opts.search) {
    where.push("s.file_name LIKE ? ESCAPE '!'");
    params.push(`%${opts.search.replace(/[!%_]/g, "!$&")}%`);
  }
  if (opts.batchId) {
    where.push("s.batch_id = ?");
    params.push(opts.batchId);
  }
  if (opts.verdict && ["Likely Real", "Suspicious", "High Risk Deepfake"].includes(opts.verdict)) {
    where.push("s.verdict = ?");
    params.push(opts.verdict);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM scans s ${whereSql}`).get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT s.*, b.label AS batch_label FROM scans s
       LEFT JOIN batches b ON b.id = s.batch_id
       ${whereSql}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, opts.limit, opts.offset) as (ScanRow & { batch_label: string | null })[];

  return {
    scans: rows.map((r) =>
      toSummary(
        r,
        r.batch_id ? ({ id: r.batch_id, user_id: r.user_id, label: r.batch_label ?? "", total: 0, created_at: "" } as BatchRow) : undefined,
      ),
    ),
    total,
  };
};

export const getScan = (userId: string, scanId: string): ScanDetail => {
  const row = getScanRow(userId, scanId);
  if (!row) throw AppError.notFound("Scan not found");
  return toDetail(row, batchForScan(userId, row));
};

export const deleteScan = (userId: string, scanId: string): void => {
  const res = db.prepare("DELETE FROM scans WHERE id = ? AND user_id = ?").run(scanId, userId);
  if (res.changes === 0) throw AppError.notFound("Scan not found");
};

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export type CreateBatchItem = { fileName: string; fileSize?: number };

export const createBatch = (
  userId: string,
  label: string,
  items: CreateBatchItem[],
): { batch: BatchSummary; scans: ScanSummary[] } => {
  if (items.length === 0) throw AppError.badRequest("Batch needs at least one file");
  if (items.length > 25) throw AppError.badRequest("At most 25 files per batch");

  const batchId = newId("bat");
  const batchLabel = label.trim() || `Batch ${new Date().toLocaleDateString()}`;
  db.prepare("INSERT INTO batches (id, user_id, label, total, created_at) VALUES (?, ?, ?, ?, ?)").run(
    batchId,
    userId,
    batchLabel,
    items.length,
    nowIso(),
  );

  const insert = db.prepare(
    `INSERT INTO scans (id, user_id, batch_id, position, file_name, file_size, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
  );
  const created = nowIso();
  db.exec("BEGIN");
  try {
    items.forEach((item, i) => {
      insert.run(newId("scn"), userId, batchId, i, item.fileName, item.fileSize ?? null, created);
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const batch = batchById(userId, batchId)!;
  const rows = db
    .prepare("SELECT * FROM scans WHERE batch_id = ? AND user_id = ? ORDER BY position")
    .all(batchId, userId) as ScanRow[];
  return { batch: batchAggregate(batch, rows), scans: rows.map((r) => toSummary(r, batch)) };
};

/** Validate a batch-item upload reference and hand the row to runScan. */
export const batchScanRef = (userId: string, batchId: string, scanId: string): { row: ScanRow } => {
  const batch = batchById(userId, batchId);
  if (!batch) throw AppError.notFound("Batch not found");
  const row = getScanRow(userId, scanId);
  if (!row || row.batch_id !== batch.id) throw AppError.notFound("Batch item not found");
  if (row.status === "completed") throw AppError.conflict("This file has already been scanned");
  return { row };
};

export const getBatch = (userId: string, batchId: string): BatchSummary & { scans: ScanSummary[] } => {
  const batch = batchById(userId, batchId);
  if (!batch) throw AppError.notFound("Batch not found");
  const rows = db
    .prepare("SELECT * FROM scans WHERE batch_id = ? AND user_id = ? ORDER BY position, created_at")
    .all(batchId, userId) as ScanRow[];
  return { ...batchAggregate(batch, rows), scans: rows.map((r) => toSummary(r, batch)) };
};

export const listBatches = (userId: string, limit = 20): BatchSummary[] => {
  const batches = db
    .prepare("SELECT * FROM batches WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit) as BatchRow[];
  return batches.map((b) => {
    const rows = db
      .prepare("SELECT status FROM scans WHERE batch_id = ?")
      .all(b.id) as { status: ScanStatus }[];
    return batchAggregate(b, rows as unknown as ScanRow[]);
  });
};

export const deleteBatch = (userId: string, batchId: string): void => {
  const batch = batchById(userId, batchId);
  if (!batch) throw AppError.notFound("Batch not found");
  // FK cascade removes the member scans.
  db.prepare("DELETE FROM batches WHERE id = ? AND user_id = ?").run(batch.id, userId);
};
