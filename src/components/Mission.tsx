import { motion } from "framer-motion";
import { ScanFace, Waves, Flame, Sigma } from "lucide-react";

const models = [
  {
    icon: ScanFace,
    name: "Picture Check",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    body: "A ResNeXt-50 CNN studies the face in every sampled frame, spotting the frequency artifacts GANs and diffusion models leave behind.",
  },
  {
    icon: Waves,
    name: "Motion Check",
    color: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/30",
    body: "An LSTM reads the whole 60-frame sequence at once. Real faces move smoothly; swapped faces flicker and drift between frames.",
  },
  {
    icon: Flame,
    name: "Explainable Verdict",
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/30",
    body: "A Grad-CAM heatmap shows exactly where the model looked before deciding, so every verdict comes with evidence you can check.",
  },
];

const Mission = () => (
  <section className="relative border-y border-border/60 bg-secondary/30 py-20 overflow-hidden">
    <div className="absolute inset-0 bg-grid opacity-20" />
    <div className="container relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl mb-12"
      >
        <div className="text-xs font-mono text-primary uppercase tracking-[0.2em] mb-3">
          How it works
        </div>
        <h2 className="text-3xl md:text-5xl font-bold">
          Three layers of <span className="text-gradient-emerald">evidence</span>, one clear answer.
        </h2>
        <p className="mt-4 text-muted-foreground text-lg">
          A single score is easy to argue with. Sach AI combines spatial artifacts,
          temporal consistency and a visual explanation, then saves everything to
          your scan history.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-6">
        {models.map((m, i) => (
          <motion.div
            key={m.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className={`relative rounded-2xl border ${m.border} bg-card/80 p-6 backdrop-blur hover:shadow-elegant transition-shadow`}
          >
            <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${m.bg} ${m.color} mb-4`}>
              <m.icon className="h-6 w-6" />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
              Layer {i + 1}
            </div>
            <h3 className="text-xl font-semibold mb-2">{m.name}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{m.body}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-5"
      >
        <Sigma className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm md:text-base">
          <span className="font-mono text-primary">Final score:</span>{" "}
          <span className="text-muted-foreground">
            the LSTM sequence verdict, weighted with per-frame scores, becomes your
          </span>{" "}
          <span className="font-semibold text-foreground">Truth Score</span>.
        </p>
      </motion.div>
    </div>
  </section>
);

export default Mission;
