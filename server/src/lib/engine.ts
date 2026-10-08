import crypto from "node:crypto";
import { config } from "../config.js";
import { AppError } from "./errors.js";
import { analyzeVideoWithModel, mlServiceHealth, type MlAnalyzeResult } from "./mlClient.js";

/**
 * Detection engine chain for a whole video, tried in order:
 *
 *   1. "sach-model" — the local pre-trained ResNeXt50+LSTM deepfake
 *      classifier (abhijithjadhav/Deepfake_detection_using_deep_learning,
 *      FaceForensics++), served by the Python microservice in ml-service/.
 *
 *   2. "demo" — a deterministic local simulator derived from the video's
 *      content hash. It keeps the whole product (auth, history, batches,
 *      reports) fully functional for development when the inference service
 *      is offline, and repeated scans of the same file always agree.
 */

export type DemoResult = {
  engine: "demo";
  fakeProbability: number;
  frames: { timestamp: number; fakeScore: number }[];
  framesAnalyzed: number;
};

export type AnalyzeResult =
  | MlAnalyzeResult
  | DemoResult;

/** Deterministic demo scores from the video content itself. */
const simulateFromVideo = (
  buffer: Buffer,
  durationSec: number,
  frameCount = 6,
): DemoResult => {
  const digest = crypto
    .createHash("sha256")
    .update(buffer.subarray(0, Math.min(buffer.length, 262_144)))
    .update(String(buffer.length))
    .digest();

  const frames = Array.from({ length: frameCount }, (_, i) => {
    const u32 = digest.readUInt32BE((i * 4) % (digest.length - 4));
    const fakeScore = Math.min(1, Math.max(0, (u32 / 0xffffffff) ** 1.4));
    return { timestamp: durationSec > 0 ? Math.round(((durationSec * i) / frameCount) * 100) / 100 : i, fakeScore };
  });

  const mean = frames.reduce((s, f) => s + f.fakeScore, 0) / frames.length;
  return { engine: "demo", fakeProbability: mean, frames, framesAnalyzed: frames.length };
};

export const analyzeVideo = async (video: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  durationHintSec?: number;
}): Promise<AnalyzeResult> => {
  if (video.buffer.length === 0) throw AppError.badRequest("Uploaded video is empty");

  try {
    return await analyzeVideoWithModel(video);
  } catch (err) {
    const isClientError = err instanceof AppError && err.status === 400;
    if (isClientError) throw err; // bad upload: no engine can fix it
    if (!config.allowDemoFallback) {
      throw AppError.unavailable("Detection service is unavailable. Start the ML service and install the required model weights.");
    }
    console.warn(
      `[engine] inference service failed (${err instanceof Error ? err.message : err}); using local simulator`,
    );
    return simulateFromVideo(video.buffer, video.durationHintSec ?? 0);
  }
};

export const engineStatus = async () => {
  const model = await mlServiceHealth();
  return {
    primary: model.available ? "sach-model" : config.allowDemoFallback ? "demo" : "unavailable",
    model,
  };
};
