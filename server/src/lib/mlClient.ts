import { config } from "../config.js";
import { AppError } from "./errors.js";

/**
 * Client for the Python inference microservice (ml-service/) that runs the
 * pre-trained ResNeXt50+LSTM deepfake classifier from
 * https://github.com/abhijithjadhav/Deepfake_detection_using_deep_learning
 * (trained on FaceForensics++). The service decodes the uploaded video,
 * samples frames evenly, detects and crops faces, and returns per-frame
 * fake scores plus Grad-CAM overlays.
 */

export type MlFrame = {
  /** Seconds into the video this frame was sampled from. */
  timestamp: number;
  /** 0-1 probability that the frame is a deepfake. */
  fakeScore: number;
  faceFound?: boolean;
};

export type FaceSwapStats = {
  /** 0-1 swap-artifact probability; null when too few face frames. */
  probability: number | null;
  framesChecked: number;
  meanLogRatio: number;
  fracSmoother: number;
};

export type GeneralistStats = {
  /** Mean fake probability across sampled full frames. */
  mean: number;
  max: number;
  /** Fraction of frames with fake probability >= 0.5. */
  fracHigh: number;
  framesChecked: number;
};

export type CevStats = {
  mean: number;
  max: number;
  fracHigh: number;
  framesChecked: number;
};

export type LstmStats = {
  sequenceProbability: number;
  windowProbabilities: number[];
  windowMax: number;
  windowMean: number;
  frames: {
    mean: number;
    median: number;
    p90: number;
    max: number;
    fracHigh: number;
    framesChecked: number;
  };
};

export type MlAnalyzeResult = {
  engine: "sach-model";
  model: string;
  sequenceLength: number;
  framesAnalyzed: number;
  facesDetected: number;
  faceCoverage?: number;
  faceDetector?: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  /** Aggregate sequence-level verdict from the LSTM. */
  prediction: "REAL" | "FAKE";
  confidence: number;
  fakeProbability: number;
  realProbability: number;
  frames: MlFrame[];
  thumbnail: string | null;
  heatmap: string | null;
  /** Second signal: face-swap blend-artifact statistics. */
  faceSwap?: FaceSwapStats | null;
  /** Third signal: Community Forensics ViT generalist detector. */
  generalist?: GeneralistStats | null;
  /** Fourth signal: CrossEfficientViT video-native detector. */
  cev?: CevStats | null;
  /** LSTM breakdown: windowed sequence verdicts + per-frame statistics. */
  lstm?: LstmStats | null;
  inferenceMs: number;
};

export type MlSignalStatus = {
  available: boolean;
  weightFiles?: number;
};

export const mlServiceHealth = async (): Promise<{
  available: boolean;
  weights?: { file: string; accuracy: number; sequenceLength: number }[];
  loaded?: number[];
  signals?: Record<string, MlSignalStatus>;
  faceDetector?: string;
}> => {
  try {
    const res = await fetch(`${config.ml.url}/health`, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return { available: false };
    const json = (await res.json()) as {
      weights?: { file: string; accuracy: number; sequenceLength: number }[];
      loaded?: number[];
      signals?: Record<string, MlSignalStatus>;
      faceDetector?: string;
    };
    return { available: true, weights: json.weights, loaded: json.loaded, signals: json.signals, faceDetector: json.faceDetector };
  } catch {
    return { available: false };
  }
};

export const analyzeVideoWithModel = async (video: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<MlAnalyzeResult> => {
  const form = new FormData();
  form.append(
    "video",
    new Blob([new Uint8Array(video.buffer)], { type: video.mimeType || "video/mp4" }),
    video.fileName || "upload.mp4",
  );
  form.append("sequenceLength", String(config.ml.sequenceLength));

  let res: Response;
  try {
    res = await fetch(`${config.ml.url}/analyze`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(config.ml.timeoutMs),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "network error";
    throw AppError.upstream(`Inference service unreachable at ${config.ml.url} (${reason})`);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : typeof body?.detail === "object" && body?.detail && "message" in (body.detail as object)
          ? String((body.detail as { message: unknown }).message)
          : `inference service failed (${res.status})`;
    // 4xx means the upload itself is the problem - surface it, don't retry
    // on another engine.
    throw new AppError(res.status < 500 ? 400 : 502, "ml_service_error", detail, body?.detail);
  }

  const json = (await res.json().catch(() => null)) as MlAnalyzeResult | null;
  if (!json || !Array.isArray(json.frames) || json.frames.length === 0) {
    throw AppError.upstream("Inference service returned a malformed response.");
  }
  return json;
};
