import { ScanLine, Film, ScanFace, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { ScanReport } from "@/data/staticData";

type Props = { consensus: ScanReport["consensus"] };

const statusMeta = {
  pass: { icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10", border: "border-primary/40", label: "Clean" },
  warn: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", border: "border-warning/40", label: "Suspicious" },
  fail: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/40", label: "Flagged" },
} as const;

const ConsensusGrid = ({ consensus }: Props) => {
  const items = [
    { key: "spatial", icon: ScanLine, name: "Spatial Check", data: consensus.spatial },
    { key: "temporal", icon: Film, name: "Temporal Check", data: consensus.temporal },
    { key: "faceConsistency", icon: ScanFace, name: "Face Consistency", data: consensus.faceConsistency },
  ] as const;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {items.map(({ key, icon: Icon, name, data }) => {
        const meta = statusMeta[data.status];
        const StatusIcon = meta.icon;
        return (
          <div
            key={key}
            className={`relative rounded-2xl border ${meta.border} bg-card/80 p-5`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.bg} ${meta.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className={`flex items-center gap-1.5 ${meta.color} text-xs font-mono`}>
                <StatusIcon className="h-3.5 w-3.5" />
                {meta.label}
              </div>
            </div>
            <h3 className="font-semibold">{name}</h3>
            <div className={`mt-1 font-mono text-2xl ${meta.color}`}>{data.score}<span className="text-sm text-muted-foreground">/100</span></div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{data.note}</p>

            <div className="mt-4 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full ${data.status === "fail" ? "bg-gradient-alert" : data.status === "warn" ? "bg-warning" : "bg-gradient-emerald"}`}
                style={{ width: `${data.score}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ConsensusGrid;
