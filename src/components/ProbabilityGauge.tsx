import { motion } from "framer-motion";

type Props = {
  value: number; // 0-100
};

const ProbabilityGauge = ({ value }: Props) => {
  const v = Math.max(0, Math.min(100, value));
  const radius = 80;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (v / 100) * circ;

  const tone =
    v >= 70
      ? { stroke: "hsl(var(--destructive))", label: "High Risk", glow: "glow-alert" }
      : v >= 40
      ? { stroke: "hsl(var(--warning))", label: "Suspicious", glow: "" }
      : { stroke: "hsl(var(--primary))", label: "Likely Real", glow: "glow-emerald" };

  return (
    <div className={`relative mx-auto flex h-56 w-56 items-center justify-center rounded-full ${tone.glow}`}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 200 200">
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke="hsl(var(--secondary))"
          strokeWidth="14"
          fill="none"
        />
        <motion.circle
          cx="100"
          cy="100"
          r={radius}
          stroke={tone.stroke}
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />
      </svg>
      <div className="text-center">
        <div className="text-5xl font-bold font-mono tracking-tight" style={{ color: tone.stroke }}>
          {v}%
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
          Deepfake Probability
        </div>
        <div className="mt-2 text-sm font-semibold" style={{ color: tone.stroke }}>
          {tone.label}
        </div>
      </div>
    </div>
  );
};

export default ProbabilityGauge;
