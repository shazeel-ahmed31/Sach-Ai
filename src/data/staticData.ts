export type Paper = {
  id: string;
  title: string;
  authors: string;
  venue: string;
  year: number;
  contribution: string;
  tag: "Spatial" | "Temporal" | "Audio Visual" | "Robustness" | "Survey";
  url: string;
};

export const literature: Paper[] = [
  {
    id: "faceforensics-2019",
    title: "FaceForensics++: Learning to Detect Manipulated Facial Images",
    authors: "A. Rossler, D. Cozzolino, L. Verdoliva, C. Riess, J. Thies, M. Niessner",
    venue: "ICCV 2019",
    year: 2019,
    contribution:
      "Standard benchmark and dataset for face manipulation detection, foundation of the Spatial Check.",
    tag: "Spatial",
    url: "https://arxiv.org/abs/1901.08971",
  },
  {
    id: "mesonet-2018",
    title: "MesoNet: a Compact Facial Video Forgery Detection Network",
    authors: "D. Afchar, V. Nozick, J. Yamagishi, I. Echizen",
    venue: "IEEE WIFS 2018",
    year: 2018,
    contribution:
      "Mesoscopic CNN that focuses on mid level features, robust under moderate compression.",
    tag: "Spatial",
    url: "https://arxiv.org/abs/1809.00888",
  },
  {
    id: "guera-rnn-2018",
    title: "Deepfake Video Detection Using Recurrent Neural Networks",
    authors: "D. Guera, E. J. Delp",
    venue: "IEEE AVSS 2018",
    year: 2018,
    contribution:
      "RNN over per frame CNN features captures inter frame inconsistencies, basis of the Temporal Check.",
    tag: "Temporal",
    url: "https://ieeexplore.ieee.org/document/8639163",
  },
  {
    id: "lips-dont-lie-2021",
    title: "Lips Don't Lie: A Generalisable and Robust Approach to Face Forgery Detection",
    authors: "A. Haliassos, K. Vougioukas, S. Petridis, M. Pantic",
    venue: "CVPR 2021",
    year: 2021,
    contribution:
      "Mouth region embeddings expose unnatural lip motion, the principle behind our Audio Sync stream.",
    tag: "Audio Visual",
    url: "https://arxiv.org/abs/2012.07657",
  },
  {
    id: "emotions-dont-lie-2020",
    title:
      "Emotions Don't Lie: An Audio Visual Deepfake Detection Method using Affective Cues",
    authors: "T. Mittal, U. Bhattacharya, R. Chandra, A. Bera, D. Manocha",
    venue: "ACM Multimedia 2020",
    year: 2020,
    contribution:
      "Cross modal affective consistency between speech and face, motivates our multimodal fusion.",
    tag: "Audio Visual",
    url: "https://arxiv.org/abs/2003.06711",
  },
  {
    id: "tolosana-survey-2020",
    title:
      "DeepFakes and Beyond: A Survey of Face Manipulation and Fake Detection",
    authors:
      "R. Tolosana, R. Vera-Rodriguez, J. Fierrez, A. Morales, J. Ortega-Garcia",
    venue: "Information Fusion 2020",
    year: 2020,
    contribution:
      "Comprehensive survey of manipulation families and detection methods that frames our consensus design.",
    tag: "Survey",
    url: "https://arxiv.org/abs/2001.00179",
  },
];

export type Milestone = {
  month: string;
  title: string;
  detail: string;
  status: "done" | "active" | "upcoming";
};

export const timeline: Milestone[] = [
  {
    month: "Month 1",
    title: "Deep Dive and Literature",
    detail:
      "Survey 40 plus papers and identify the generalization gap on real world compressed video.",
    status: "done",
  },
  {
    month: "Month 2",
    title: "Dataset Curation",
    detail:
      "Collect a multi source video corpus and generate compressed deepfakes simulating common social media pipelines.",
    status: "done",
  },
  {
    month: "Month 3",
    title: "Model Training",
    detail:
      "Train Spatial (EfficientNet B4), Temporal (3D CNN) and Audio Sync (Wav2Vec2 plus Lip CNN).",
    status: "active",
  },
  {
    month: "Month 4",
    title: "Consensus Engine and XAI",
    detail:
      "Fuse model scores, integrate Grad CAM heatmaps, and build the Truth Report UI.",
    status: "upcoming",
  },
  {
    month: "Month 5",
    title: "Evaluation and Thesis",
    detail:
      "Benchmark against the state of the art, run a journalist user study, and write the final thesis.",
    status: "upcoming",
  },
];

export type ScanReport = {
  fileName: string;
  probability: number; // 0-100
  verdict: "Likely Real" | "Suspicious" | "High Risk Deepfake";
  compressionRobustness: number; // 0-100
  resolution: string;
  duration: string;
  thumbnail?: string;
  /** Grad-CAM overlay produced by the detection model, when available. */
  heatmap?: string;
  engine?: "sach-model" | "demo";
  model?: string;
  modelsInAgreement: string;
  consensus: {
    spatial: { score: number; status: "pass" | "warn" | "fail"; note: string };
    temporal: { score: number; status: "pass" | "warn" | "fail"; note: string };
    faceConsistency: { score: number; status: "pass" | "warn" | "fail"; note: string };
  };
  flags: string[];
};

export type ResultTier = "high" | "medium" | "safe";

const HIGH_FAKE: Omit<ScanReport, "fileName" | "resolution" | "duration" | "thumbnail"> = {
  probability: 87,
  verdict: "High Risk Deepfake",
  compressionRobustness: 92,
  modelsInAgreement: "3 / 3",
  consensus: {
    spatial: {
      score: 81,
      status: "fail",
      note: "Diffusion style frequency artifacts around the jawline.",
    },
    temporal: {
      score: 78,
      status: "fail",
      note: "Inter frame flicker on the cheek and chin region.",
    },
    faceConsistency: {
      score: 93,
      status: "fail",
      note: "Phoneme viseme mismatch on multiple speech segments.",
    },
  },
  flags: [
    "Phoneme Viseme Mismatch Detected",
    "Re encoding Signature",
    "Grad CAM focus on mouth and jaw",
  ],
};

const MEDIUM_FAKE: Omit<ScanReport, "fileName" | "resolution" | "duration" | "thumbnail"> = {
  probability: 58,
  verdict: "Suspicious",
  compressionRobustness: 74,
  modelsInAgreement: "2 / 3",
  consensus: {
    spatial: {
      score: 62,
      status: "warn",
      note: "Mild frequency irregularities in the lower face region.",
    },
    temporal: {
      score: 55,
      status: "warn",
      note: "Brief head pose drift detected in two scene cuts.",
    },
    faceConsistency: {
      score: 49,
      status: "warn",
      note: "Borderline phoneme alignment, manual review recommended.",
    },
  },
  flags: [
    "Borderline Sync Confidence",
    "Mild Compression Tampering",
    "Manual Review Suggested",
  ],
};

const SAFE_VIDEO: Omit<ScanReport, "fileName" | "resolution" | "duration" | "thumbnail"> = {
  probability: 8,
  verdict: "Likely Real",
  compressionRobustness: 96,
  modelsInAgreement: "0 / 3",
  consensus: {
    spatial: {
      score: 12,
      status: "pass",
      note: "No diffusion or GAN signatures detected in the frequency domain.",
    },
    temporal: {
      score: 9,
      status: "pass",
      note: "Smooth motion vectors and consistent head pose throughout.",
    },
    faceConsistency: {
      score: 7,
      status: "pass",
      note: "Phoneme to viseme alignment within natural speech tolerance.",
    },
  },
  flags: [
    "Natural Compression Profile",
    "Consistent Lighting and Pose",
    "Audio Sync Within Norm",
  ],
};

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const jitter = (base: number, range: number) =>
  clamp(Math.round(base + (Math.random() * 2 - 1) * range), 0, 100);

const buildReport = (
  tier: ResultTier,
  meta: { fileName: string; resolution: string; duration: string; thumbnail?: string },
  randomize = false,
): ScanReport => {
  const preset = tier === "high" ? HIGH_FAKE : tier === "medium" ? MEDIUM_FAKE : SAFE_VIDEO;
  if (!randomize) {
    return { ...preset, ...meta };
  }
  return {
    ...preset,
    probability: jitter(preset.probability, 6),
    compressionRobustness: jitter(preset.compressionRobustness, 4),
    consensus: {
      spatial: { ...preset.consensus.spatial, score: jitter(preset.consensus.spatial.score, 5) },
      temporal: { ...preset.consensus.temporal, score: jitter(preset.consensus.temporal.score, 5) },
      faceConsistency: { ...preset.consensus.faceConsistency, score: jitter(preset.consensus.faceConsistency.score, 5) },
    },
    ...meta,
  };
};

export const sampleReport: ScanReport = buildReport("high", {
  fileName: "sample_clip_03.mp4",
  resolution: "1280 x 720",
  duration: "00:14",
});
