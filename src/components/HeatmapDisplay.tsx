import heatmap from "@/assets/heatmap-mock.jpg";

const HeatmapDisplay = () => (
  <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
        XAI Grad CAM Overlay
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">FRAME 0247</span>
    </div>
    <div className="relative">
      <img
        src={heatmap}
        alt="Grad-CAM heatmap on a face highlighting the mouth region"
        loading="lazy"
        width={1024}
        height={1024}
        className="w-full h-auto"
      />
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-md bg-background/80 backdrop-blur px-3 py-2 text-[11px] font-mono">
        <span className="text-destructive">● Focus: mouth & jaw</span>
        <span className="text-muted-foreground">activation 0.87</span>
      </div>
    </div>
    <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
      Red regions show where the model concentrated to reach its verdict this is{" "}
      <span className="text-foreground font-medium">why</span> it called this clip a deepfake, not just{" "}
      <span className="text-foreground font-medium">what</span>.
    </div>
  </div>
);

export default HeatmapDisplay;
