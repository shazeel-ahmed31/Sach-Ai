import type { AnalyzeResult } from "./engine.js";

/**
 * Builds the "ScanReport" shape the frontend report page renders, from a
 * detection-engine result. The server persists this JSON with every scan so
 * the report page can re-render identically from history.
 */

export type ScanSignals = {
  maxFakeScore: number;
  meanFakeScore: number;
  framesAnalyzed: number;
};

export type ScanReport = {
  fileName: string;
  probability: number;
  verdict: "Likely Real" | "Suspicious" | "High Risk Deepfake";
  compressionRobustness: number;
  resolution: string;
  duration: string;
  thumbnail?: string;
  heatmap?: string;
  engine: "sach-model" | "demo";
  model?: string;
  modelsInAgreement: string;
  consensus: {
    spatial: { score: number; status: "pass" | "warn" | "fail"; note: string };
    temporal: { score: number; status: "pass" | "warn" | "fail"; note: string };
    faceConsistency: { score: number; status: "pass" | "warn" | "fail"; note: string };
  };
  flags: string[];
};

const verdictLevelLabel = (probability: number): string =>
  probability >= 70
    ? "High AI-manipulation likelihood"
    : probability >= 35
      ? "Mixed signal, manual review recommended"
      : "No strong manipulation signal";

export const verdictFor = (probability: number): ScanReport["verdict"] => {
  if (probability >= 70) return "High Risk Deepfake";
  if (probability >= 35) return "Suspicious";
  return "Likely Real";
};

const statusFor = (score01: number): "pass" | "warn" | "fail" => {
  if (score01 >= 0.7) return "fail";
  if (score01 >= 0.35) return "warn";
  return "pass";
};

const formatDuration = (sec: number) => {
  if (!isFinite(sec) || sec <= 0) return "00:00";
  const total = Math.round(sec);
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
};

export type BuiltScan = {
  report: ScanReport;
  signals: ScanSignals;
  probability: number;
  verdict: ScanReport["verdict"];
  durationSec: number;
  width: number;
  height: number;
  thumbnail: string | null;
};

export const buildScanReport = (input: {
  fileName: string;
  result: AnalyzeResult;
}): BuiltScan => {
  const { fileName, result } = input;

  const frameScores = result.frames.map((f) => f.fakeScore);
  const max = frameScores.reduce((m, s) => Math.max(m, s), 0);
  const mean = frameScores.reduce((s, f) => s + f, 0) / Math.max(1, frameScores.length);
  const variance =
    frameScores.reduce((s, f) => s + (f - mean) ** 2, 0) / Math.max(1, frameScores.length);

  // --- Ensemble (corroboration architecture, v3) ---------------------------
  // Four signals with complementary failure modes:
  //   lstmProb  - ResNeXt+LSTM sequence model. Good on FF++-style deepfakes;
  //               blind to modern swaps/AI video; false-fires out of domain.
  //   swapProb  - blend-artifact check. Catches inswapper-style swaps; also
  //               false-fires on beautified/skin-smoothed real footage.
  //   gen       - Community Forensics ViT generalist (4,803 generators).
  //               Strong real-video calibration; misses compressed AI video.
  //   cev       - CrossEfficientViT (video-native, DFDC-trained). The only
  //               signal that reliably flags fully AI-generated video; clean
  //               on real footage.
  const modelProb01 = result.fakeProbability;
  const swap = result.engine === "sach-model" && result.faceSwap ? result.faceSwap : null;
  const swapProb01 = swap?.probability ?? null;
  const gen = result.engine === "sach-model" && result.generalist ? result.generalist : null;
  const cev = result.engine === "sach-model" && result.cev ? result.cev : null;
  const lstm = result.engine === "sach-model" && result.lstm ? result.lstm : null;
  const lstmWindowMax = lstm?.windowMax ?? 0;
  const lstmWindowMean = lstm?.windowMean ?? 0;

  const isModel = result.engine === "sach-model";
  const facesDetected = isModel ? result.facesDetected : null;
  const faceCoverage =
    result.engine === "sach-model"
      ? result.facesDetected / Math.max(1, result.framesAnalyzed)
      : 0;
  const srcWidth = result.engine === "sach-model" ? result.width : 0;

  // 90th percentile of per-frame LSTM scores - the sequence verdict can be
  // blind even when most frames read fake, and vice versa. Windowed sequence
  // verdicts (3 x ~20 frames, matching the model's training regime) are the
  // more robust LSTM read on edited videos with speaker cuts.
  const sortedScores = [...frameScores].sort((a, b) => a - b);
  const lstmP90 = lstm
    ? lstm.frames.p90
    : sortedScores.length > 0
      ? sortedScores[Math.min(sortedScores.length - 1, Math.floor(sortedScores.length * 0.9))]
      : 0;

  const swapFires = (swapProb01 ?? 0) >= 0.6;
  // A signature this systematic (>= 60% of frames, strong direction) is
  // manipulation evidence, not the beauty-filter false positive the
  // overrule path exists for - it must never be softened to "Likely Real".
  const swapSignatureStrong = swapFires;
  const genStrong = gen !== null && (gen.mean >= 0.5 || gen.fracHigh >= 0.5);
  const cevStrong = cev !== null && cev.mean >= 0.5;
  const genWeakSignal =
    gen !== null && ((gen.fracHigh >= 0.1 && gen.max >= 0.8) || gen.mean >= 0.15);
  const cevPeak = cev !== null && cev.max >= 0.9;
  // Corroboration for a firing swap check: persistent learned-detector
  // evidence (frame fractions / means), never a single-frame spike. The
  // windowed LSTM verdict counts: it recovers the sequence model on edited
  // videos where the single 60-frame pass collapses.
  const swapCorroborated =
    (gen !== null && (gen.fracHigh >= 0.1 || gen.mean >= 0.15 || gen.max >= 0.8)) ||
    (cev !== null && (cev.fracHigh >= 0.1 || cev.mean >= 0.15)) ||
    lstmP90 >= 0.7 ||
    lstmWindowMax >= 0.8;
  const lstmInDomain = modelProb01 >= 0.8 && srcWidth >= 480;
  // Corroboration for the LSTM: distinct thresholds tuned on the labeled set
  // (a generalist mean of 0.05-0.10 is noise, not support; the video-native
  // detector needs BOTH a high mean and a high flagged-frame fraction, since
  // a handful of hot frames skew its mean on real footage).
  const lstmCorroborated =
    (gen !== null && (gen.mean >= 0.1 || gen.fracHigh >= 0.1 || gen.max >= 0.3)) ||
    (cev !== null && ((cev.mean >= 0.3 && cev.fracHigh >= 0.25) || cev.fracHigh >= 0.25));
  // The generalist ViT is the best real-calibrated signal; when it is this
  // firmly "real", an LSTM-only fire is treated as a false alarm.
  const genFirmReal = gen !== null && gen.mean <= 0.02 && gen.fracHigh <= 0.02;

  let overruledToReal = false;
  let cappedToSuspicious = false;
  let probability01: number;

  const highRiskPathsActive =
    cevStrong ||
    genStrong ||
    (swapFires && swapCorroborated) ||
    (cevPeak && (genWeakSignal || (lstmP90 >= 0.3 && !genFirmReal)));

  if (highRiskPathsActive) {
    // Corroborated High Risk: strongest signal drives the score, floored at
    // 70% so the reported probability matches the verdict.
    probability01 = Math.max(modelProb01, swapProb01 ?? 0, gen?.mean ?? 0, cev?.mean ?? 0, 0.7);
  } else if (swapFires && !swapCorroborated) {
    // Swap signature with no learned support: when every learned detector
    // scores firmly real AND the signature itself is mild, this is the
    // beauty-filter false positive of the smoothness heuristic - overrule
    // to Likely Real with an honest flag. A strong signature always stays
    // at least Suspicious for manual review.
    const overruleEligible =
      !swapSignatureStrong &&
      (gen?.mean ?? 1) <= 0.1 &&
      (cev?.mean ?? 1) <= 0.15 &&
      modelProb01 <= 0.25 &&
      lstmP90 <= 0.35;
    if (overruleEligible) {
      overruledToReal = true;
      probability01 = Math.max(0.25, modelProb01, gen?.mean ?? 0);
    } else {
      cappedToSuspicious = true;
      probability01 = Math.min(Math.max(swapProb01 ?? 0, 0.35), 0.65);
    }
  } else if (lstmInDomain && (!lstmCorroborated || genFirmReal)) {
    // The LSTM fires in-domain but no learned detector supports it - or the
    // best real-calibrated detector (generalist ViT) actively scores the
    // video firmly real. Either way this is the LSTM's out-of-domain
    // false-positive regime. Cap at Suspicious, never High Risk.
    cappedToSuspicious = true;
    probability01 = 0.65;
  } else if (modelProb01 >= 0.7 && srcWidth < 480 && !lstmCorroborated) {
    // Same guard for sub-480px sources.
    cappedToSuspicious = true;
    probability01 = 0.65;
  } else {
    // Nothing fired alone at High-Risk strength. A swap that fired without
    // corroboration was already capped above, so blend the rest directly.
    probability01 = Math.max(
      modelProb01,
      gen?.mean ?? 0,
      cev?.mean ?? 0,
      Math.min(swapProb01 ?? 0, 0.65),
    );
  }

  const probability = Math.round(probability01 * 100);
  const verdict = verdictFor(probability);

  // The LSTM already models temporal context, so its (windowed) aggregate
  // doubles as the temporal-consensus score; spatial consensus is the peak
  // per-frame score.
  const spatial01 = max;
  const temporal01 = Math.max(modelProb01, lstmWindowMean);
  const agreement = [spatial01, temporal01, swapProb01 ?? 0, gen?.mean ?? 0, cev?.mean ?? 0].filter(
    (s) => s >= 0.5,
  ).length;

  // Data-quality + explanation flags.
  const qualityFlags: string[] = [];
  if (isModel) {
    if (faceCoverage < 0.5) {
      qualityFlags.push(
        `Low face coverage (${result.facesDetected}/${result.framesAnalyzed} frames) - treat the verdict with extra caution`,
      );
    }
    if (srcWidth < 480 && verdict === "High Risk Deepfake") {
      qualityFlags.push(
        `Low source resolution (${result.width}x${result.height}) - compression artifacts can skew the model`,
      );
    }
  }

  const ensembleFlags: string[] = [];
  if (gen) {
    ensembleFlags.push(
      `Generalist ViT (4,803 generators): ${Math.round(gen.fracHigh * 100)}% of frames above 50% fake-likelihood, peak ${Math.round(gen.max * 100)}%`,
    );
  }
  if (cev) {
    ensembleFlags.push(
      `Video-native CrossEfficientViT: ${Math.round(cev.mean * 100)}% mean fake-likelihood across ${cev.framesChecked} face frames${cev.fracHigh >= 0.5 ? " - strongly flagged" : ""}`,
    );
  }
  if (overruledToReal) {
    ensembleFlags.push(
      `Face-smoothing signature present on ${swap!.framesChecked} frames but overruled: all learned detectors score firmly real (beauty filters and portrait blur cause this signature on real footage)`,
    );
  } else if (cappedToSuspicious) {
    ensembleFlags.push(
      `Verdict capped at Suspicious: the sequence model fired but neither the generalist ViT, the video-native detector, nor the artifact check corroborates it`,
    );
  }
  if (swapProb01 !== null && !overruledToReal) {
    // Always surface the Face Consistency measurement - including on
    // capped verdicts, where hiding it previously made the signal look
    // broken (the user sees the card score but not what it measured).
    if (swapProb01 >= 0.6 && (genWeakSignal || cevPeak || lstmP90 >= 0.7)) {
      ensembleFlags.push(
        `Face-swap artifact check: ${Math.round(swapProb01 * 100)}% - unnatural face smoothness on ${Math.round(swap!.fracSmoother * swap!.framesChecked)}/${swap!.framesChecked} frames, corroborated`,
      );
    } else if (swapProb01 >= 0.6) {
      ensembleFlags.push(
        `Face-swap artifact check: ${Math.round(swapProb01 * 100)}% - unnatural face smoothness on ${Math.round(swap!.fracSmoother * swap!.framesChecked)}/${swap!.framesChecked} frames (uncorroborated - review recommended)`,
      );
    } else {
      ensembleFlags.push(
        `Face-swap artifact check clean: ${Math.round(swapProb01 * 100)}% across ${swap!.framesChecked} frames (mean texture ratio ${swap!.meanLogRatio.toFixed(2)})`,
      );
    }
  }

  const flags = isModel
    ? [
        `ResNeXt+LSTM analyzed ${result.framesAnalyzed} frames` +
          (facesDetected !== null ? ` (${facesDetected} with a detected face)` : ""),
        `Model: ${result.model} · sequence verdict ${result.prediction} at ${result.confidence}% confidence` +
          (lstm ? ` · windowed max ${Math.round(lstmWindowMax * 100)}%` : ""),
        verdictLevelLabel(probability),
        ...ensembleFlags,
        ...qualityFlags,
      ]
    : [
        `Local simulator scored ${result.framesAnalyzed} pseudo-frames`,
        "Inference service offline - start ml-service/ for real model output",
        probability >= 70
          ? "High simulated-manipulation likelihood"
          : probability >= 35
            ? "Mixed simulated signal"
            : "No simulated manipulation signal",
      ];

  const durationSec = isModel ? result.durationSec : 0;
  const width = isModel ? result.width : 0;
  const height = isModel ? result.height : 0;
  const thumbnail = isModel ? result.thumbnail : null;

  // Third consensus lane: the blend-artifact check when it ran; otherwise
  // the mean per-frame signal as an honestly-labelled fallback. The card's
  // status stays coherent with the final verdict: a swap-only signature that
  // was overruled shows as "warn" with the explanation, never "fail".
  const consistency01 = swapProb01 ?? mean;
  const consistencyNote = overruledToReal
    ? `Smoothing signature present on ${swap!.framesChecked} frames, but all learned detectors score firmly real - typical of beauty-filtered footage, not evidence of a swap.`
    : swapProb01 !== null
      ? `Face-interior vs surroundings high-frequency mismatch on ${swap!.framesChecked} frames${swapProb01 >= 0.6 ? " - systematic smoothness signature detected" : "; no systematic swap signature"}.`
      : "Blend-artifact check unavailable; mean per-frame signal shown instead.";
  const consistencyStatus: "pass" | "warn" | "fail" =
    verdict === "High Risk Deepfake"
      ? statusFor(consistency01)
      : consistency01 >= 0.5
        ? "warn"
        : statusFor(consistency01);

  const report: ScanReport = {
    fileName,
    probability,
    verdict,
    compressionRobustness: Math.max(60, 100 - Math.round(Math.sqrt(variance) * 100)),
    resolution: width > 0 ? `${width} x ${height}` : "Unknown",
    duration: formatDuration(durationSec),
    ...(thumbnail ? { thumbnail } : {}),
    ...(isModel && result.heatmap ? { heatmap: result.heatmap } : {}),
    engine: result.engine,
    ...(isModel ? { model: result.model } : {}),
    modelsInAgreement: `${agreement} / 3`,
    consensus: {
      spatial: {
        score: Math.round(spatial01 * 100),
        status: statusFor(spatial01),
        note: `Peak per-frame fake score: ${(spatial01 * 100).toFixed(1)}%.`,
      },
      temporal: {
        score: Math.round(temporal01 * 100),
        status: statusFor(temporal01),
        note: `Windowed LSTM verdicts across ${result.framesAnalyzed} sampled frames (robust to speaker cuts).`,
      },
      faceConsistency: {
        score: Math.round(consistency01 * 100),
        status: consistencyStatus,
        note: consistencyNote,
      },
    },
    flags,
  };

  return {
    report,
    signals: { maxFakeScore: max, meanFakeScore: mean, framesAnalyzed: frameScores.length },
    probability,
    verdict,
    durationSec,
    width,
    height,
    thumbnail,
  };
};
