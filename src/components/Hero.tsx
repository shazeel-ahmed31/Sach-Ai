import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ScanSearch, FileVideo2, Layers } from "lucide-react";

const useCountUp = (target: number, durationMs = 1400, decimals = 0) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Number((target * eased).toFixed(decimals)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, decimals]);
  return value;
};

/** The 18-bar "per-frame score" readout inside the console. */
const ScoreBars = () => (
  <div className="flex h-16 items-end gap-1">
    {Array.from({ length: 18 }).map((_, i) => (
      <motion.span
        key={i}
        className="w-full max-w-[10px] flex-1 origin-bottom rounded-sm bg-gradient-to-t from-primary/25 to-primary"
        initial={{ scaleY: 0.25 }}
        animate={{ scaleY: [0.2, 0.45 + ((i * 7) % 10) / 14, 0.3, 0.85 - ((i * 3) % 10) / 18, 0.25] }}
        transition={{
          duration: 3.2 + (i % 5) * 0.4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: i * 0.08,
        }}
        style={{ height: "100%" }}
      />
    ))}
  </div>
);

/** Code-drawn live analysis console - replaces the old stock photo. */
const ForensicConsole = () => {
  const [frame, setFrame] = useState(142);
  const [fakePct, setFakePct] = useState(93);

  useEffect(() => {
    const t = setInterval(() => {
      setFrame((f) => f + 1);
      setFakePct((p) => {
        const next = p + Math.round((Math.random() - 0.45) * 6);
        return Math.min(98, Math.max(78, next));
      });
    }, 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative rounded-2xl border border-primary/25 bg-card/70 backdrop-blur-xl shadow-elegant overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5 font-mono text-[10px]">
        <span className="flex items-center gap-2 text-primary">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          LIVE · ANALYZING
        </span>
        <span className="text-muted-foreground">RESNEXT+LSTM · 60 FRAMES</span>
      </div>

      {/* video frame */}
      <div className="relative aspect-video overflow-hidden bg-[#04120d]">
        {/* abstract "footage": drifting gradient */}
        <motion.div
          className="absolute inset-[-20%]"
          style={{
            background:
              "radial-gradient(42% 60% at 38% 42%, rgba(16,185,129,0.22), transparent 70%), radial-gradient(36% 46% at 64% 58%, rgba(45,212,191,0.14), transparent 70%), radial-gradient(30% 40% at 50% 30%, rgba(59,130,246,0.10), transparent 70%)",
          }}
          animate={{ x: [0, 24, -18, 0], y: [0, -14, 10, 0], rotate: [0, 2, -2, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* grid */}
        <div className="absolute inset-0 bg-[linear-gradient(transparent_95%,rgba(16,185,129,0.10)_95%),linear-gradient(90deg,transparent_95%,rgba(16,185,129,0.10)_95%)] bg-[size:36px_36px]" />

        {/* drifting face box with corner brackets */}
        <motion.div
          className="absolute left-1/2 top-1/2 h-[52%] w-[30%] -translate-x-1/2 -translate-y-1/2"
          animate={{ x: [-10, 12, -8, -10], y: [-6, 8, -4, -6] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="relative h-full w-full border border-primary/50 bg-primary/5">
            {["-top-px -left-px border-l-2 border-t-2", "-top-px -right-px border-r-2 border-t-2", "-bottom-px -left-px border-b-2 border-l-2", "-bottom-px -right-px border-r-2 border-b-2"].map(
              (pos) => (
                <span key={pos} className={`absolute h-4 w-4 border-primary ${pos}`} />
              ),
            )}
            <span className="absolute -top-6 left-0 font-mono text-[10px] text-primary">
              face 0.98
            </span>
          </div>
        </motion.div>

        {/* scanning line */}
        <motion.div
          className="absolute inset-x-0 h-[2px] bg-primary/70 shadow-[0_0_24px_6px_hsl(var(--primary)/0.35)]"
          animate={{ top: ["2%", "96%", "2%"] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
        />

        {/* HUD */}
        <div className="absolute left-3 top-3 font-mono text-[10px] text-primary/80">
          FRAME {String(frame).padStart(4, "0")} / 0600
        </div>
        <div className="absolute right-3 top-3 font-mono text-[10px] text-primary/80">
          GRAD-CAM READY
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <ScoreBars />
        </div>
      </div>

      {/* verdict strip */}
      <div className="flex items-center justify-between gap-4 border-t border-border/70 px-4 py-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Deepfake probability
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-destructive">{fakePct}%</span>
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive">
              HIGH RISK
            </span>
          </div>
        </div>
        <div className="h-1.5 flex-1 max-w-[45%] rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="h-full bg-gradient-alert"
            animate={{ width: `${fakePct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
};

const Hero = () => {
  const frames = useCountUp(60);
  const scans = useCountUp(2, 1400, 0);

  return (
    <section className="relative overflow-hidden border-b border-border/60">
      {/* animated aurora background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <motion.div
          className="absolute -top-48 left-[15%] h-[480px] w-[720px] rounded-full bg-primary/20 blur-[130px]"
          animate={{ x: [0, 90, 0], y: [0, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-24 right-[-10%] h-[420px] w-[560px] rounded-full bg-accent/15 blur-[120px]"
          animate={{ x: [0, -70, 0], y: [0, 60, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[-30%] left-[35%] h-[380px] w-[520px] rounded-full bg-emerald-500/10 blur-[110px]"
          animate={{ x: [0, 50, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="container relative grid lg:grid-cols-2 gap-12 items-center py-20 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-mono text-primary mb-6">
            <ScanSearch className="h-3 w-3" />
            Local deepfake forensics · trained on FaceForensics++
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.05]">
            Restoring <span className="text-gradient-emerald">Truth</span>
            <br />
            to Your Screen.
          </h1>

          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            Sach AI runs every clip through a ResNeXt + LSTM deepfake detector on your
            own machine — face crops, motion reasoning and a Grad-CAM heatmap you can
            actually read. Every report is saved to your account.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/detect"
              className="group inline-flex items-center gap-2 rounded-lg bg-gradient-emerald px-6 py-3 font-semibold text-primary-foreground shadow-elegant transition-transform hover:scale-[1.03]"
            >
              Verify a Video
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/report"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-6 py-3 font-semibold text-foreground hover:bg-secondary transition-colors"
            >
              See Sample Report
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
            <div>
              <div className="text-2xl font-bold text-primary font-mono">Research</div>
              <div className="text-xs text-muted-foreground">Prototype; results need review</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary font-mono">{frames}</div>
              <div className="text-xs text-muted-foreground">Default sampled frames</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary font-mono">{scans}</div>
              <div className="text-xs text-muted-foreground">Detection engines, zero API keys</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative"
        >
          <div className="absolute -inset-4 rounded-3xl bg-primary/10 blur-2xl pointer-events-none" />
          <ForensicConsole />
          <div className="mt-4 flex flex-wrap justify-center gap-3 font-mono text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1">
              <FileVideo2 className="h-3 w-3 text-primary" /> MP4 · MOV · WebM
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1">
              <Layers className="h-3 w-3 text-primary" /> Batch scan up to 25 clips
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1">
              <ScanSearch className="h-3 w-3 text-primary" /> Grad-CAM on every report
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
