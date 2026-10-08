import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { AppError, asyncRouteSafe } from "../lib/routeUtils.js";
import { requireAuth } from "../middleware/auth.js";
import {
  batchScanRef,
  createBatch,
  deleteBatch,
  deleteScan,
  getBatch,
  getScan,
  listBatches,
  listScans,
  runScan,
  type VideoUpload,
} from "../services/scan.service.js";
import type { Express, Request } from "express";

/** Whole videos go to the Python service for decoding; keep them in memory. */
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxVideoBytes, files: 1, fields: 6, fieldSize: 65_536 },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname.split(".").pop() ?? "").toLowerCase();
    const looksLikeVideo =
      file.mimetype.startsWith("video/") ||
      (file.mimetype === "image/gif" && ext === "gif") ||
      config.uploads.allowedExtensions.has(ext);
    if (!looksLikeVideo) {
      cb(AppError.badRequest(`"${ext || file.mimetype}" is not a supported video format`));
      return;
    }
    cb(null, true);
  },
});

const requireVideo = (req: Request): VideoUpload => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw AppError.badRequest("Attach the video in a multipart 'video' field");
  return { buffer: file.buffer, fileName: file.originalname, mimeType: file.mimetype };
};

export const scanRouter = Router();
// Scope auth to the scan/batch paths so public routes (health) mounted on
// the same prefix are not intercepted.
scanRouter.use("/scans", requireAuth);
scanRouter.use("/batches", requireAuth);

// ---------------------------------------------------------------------------
// Single scans
// ---------------------------------------------------------------------------

scanRouter.post(
  "/scans",
  asyncRouteSafe(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      videoUpload.single("video")(req, res, (err) => (err ? reject(err) : resolve()));
    });
    const scan = await runScan(req.user!.id, requireVideo(req));
    res.status(201).json({ scan });
  }),
);

scanRouter.get("/scans", (req, res) => {
  const q = z
    .object({
      search: z.string().trim().max(120).optional(),
      batchId: z.string().trim().max(64).optional(),
      verdict: z.string().trim().max(40).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .parse(req.query);
  res.json(listScans(req.user!.id, q));
});

scanRouter.get("/scans/:id", (req, res) => {
  res.json({ scan: getScan(req.user!.id, req.params.id) });
});

scanRouter.delete("/scans/:id", (req, res) => {
  deleteScan(req.user!.id, req.params.id);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

const createBatchSchema = z.object({
  label: z.string().trim().max(120).optional().default(""),
  items: z
    .array(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        fileSize: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(25),
});

scanRouter.post(
  "/batches",
  asyncRouteSafe(async (req, res) => {
    const body = createBatchSchema.parse(req.body);
    res.status(201).json(createBatch(req.user!.id, body.label, body.items));
  }),
);

scanRouter.get("/batches", (_req, res) => {
  res.json({ batches: listBatches(_req.user!.id) });
});

scanRouter.get("/batches/:id", (req, res) => {
  res.json(getBatch(req.user!.id, req.params.id));
});

scanRouter.delete("/batches/:id", (req, res) => {
  deleteBatch(req.user!.id, req.params.id);
  res.status(204).end();
});

/** Upload the video for one pending item of a batch; runs the scan inline. */
scanRouter.post(
  "/batches/:batchId/scans/:scanId",
  asyncRouteSafe(async (req, res) => {
    const { row } = batchScanRef(req.user!.id, req.params.batchId, req.params.scanId);
    await new Promise<void>((resolve, reject) => {
      videoUpload.single("video")(req, res, (err) => (err ? reject(err) : resolve()));
    });
    const scan = await runScan(req.user!.id, requireVideo(req), { existingRow: row });
    res.status(201).json({ scan });
  }),
);
