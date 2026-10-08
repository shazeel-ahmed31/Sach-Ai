import { literature } from "@/data/staticData";
import { ExternalLink } from "lucide-react";

const tagColor: Record<string, string> = {
  Spatial: "bg-primary/15 text-primary border-primary/30",
  Temporal: "bg-accent/15 text-accent border-accent/30",
  "Audio Visual": "bg-warning/15 text-warning border-warning/30",
  Robustness: "bg-destructive/15 text-destructive border-destructive/30",
  Survey: "bg-muted text-muted-foreground border-border",
};

const LiteratureTable = () => (
  <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground font-mono">
          <tr>
            <th className="px-4 py-3 text-left">Paper</th>
            <th className="px-4 py-3 text-left">Venue</th>
            <th className="px-4 py-3 text-left">Year</th>
            <th className="px-4 py-3 text-left">Stream</th>
            <th className="px-4 py-3 text-left">Contribution</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {literature.map((p) => (
            <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
              <td className="px-4 py-4 align-top">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold flex items-start gap-1.5 hover:text-primary transition-colors"
                >
                  {p.title}
                  <ExternalLink className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
                </a>
                <div className="text-xs text-muted-foreground mt-0.5">{p.authors}</div>
              </td>
              <td className="px-4 py-4 align-top text-muted-foreground">{p.venue}</td>
              <td className="px-4 py-4 align-top font-mono text-muted-foreground">{p.year}</td>
              <td className="px-4 py-4 align-top">
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-mono ${tagColor[p.tag]}`}>
                  {p.tag}
                </span>
              </td>
              <td className="px-4 py-4 align-top text-muted-foreground max-w-md">{p.contribution}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default LiteratureTable;
