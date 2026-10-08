import { motion } from "framer-motion";
import { AlertTriangle, Smartphone, Globe } from "lucide-react";

const items = [
  {
    icon: Globe,
    title: "Trained on the wrong videos",
    body: "Most deepfake checkers were built using high quality English videos. They have not really seen the kind of clips that people actually share in Pakistan.",
  },
  {
    icon: Smartphone,
    title: "Hurt by low quality",
    body: "When a video is shared again and again, it loses quality. The tiny clues that detectors look for get washed away before the clip reaches you.",
  },
  {
    icon: AlertTriangle,
    title: "Not made for Urdu",
    body: "Most lip reading checks are tuned for English. Sach AI is built with Urdu speakers in mind so it stays accurate on local videos.",
  },
];

const Problem = () => (
  <section className="container py-20">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl"
    >
      <div className="text-xs font-mono text-primary uppercase tracking-[0.2em] mb-3">
        Why we built Sach AI
      </div>
      <h2 className="text-3xl md:text-5xl font-bold">
        Why most checkers <span className="text-destructive">fail</span> on Pakistani videos.
      </h2>
      <p className="mt-4 text-muted-foreground text-lg">
        Popular deepfake checkers can drop from 96% accuracy down to about 58% on
        the kind of grainy, forwarded clips people actually watch every day.
      </p>
    </motion.div>

    <div className="mt-12 grid md:grid-cols-3 gap-6">
      {items.map((it, i) => (
        <motion.div
          key={it.title}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: i * 0.1 }}
          className="group rounded-2xl border border-border bg-card/60 p-6 hover:border-primary/40 transition-colors"
        >
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive mb-4">
            <it.icon className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-lg mb-2">{it.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{it.body}</p>
        </motion.div>
      ))}
    </div>
  </section>
);

export default Problem;
