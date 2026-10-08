import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FileUpload from "@/components/FileUpload";
import { Server, History, Layers, Zap } from "lucide-react";

const features = [
  { icon: Server, label: "Runs on your own server" },
  { icon: Zap, label: "ResNeXt+LSTM, trained on FaceForensics++" },
  { icon: History, label: "Every scan saved to your account" },
];

const Detect = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1">
      <section className="container py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-10"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-mono text-primary mb-4">
            Video Check
          </div>
          <h1 className="text-4xl md:text-5xl font-bold">
            Is this video <span className="text-gradient-emerald">Real</span>?
          </h1>
          <p className="mt-3 text-muted-foreground">
            Drop a clip and we will tell you in plain words whether it looks real or fake,
            with simple reasons you can understand.
          </p>
          <div className="mt-5">
            <Link
              to="/batch"
              className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-4 py-1.5 text-xs font-mono text-primary transition-colors hover:bg-primary/10"
            >
              <Layers className="h-3.5 w-3.5" />
              Have many clips? Use batch scanning instead
            </Link>
          </div>
        </motion.div>

        <FileUpload />

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {features.map((f) => (
            <div
              key={f.label}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground"
            >
              <f.icon className="h-3.5 w-3.5 text-primary" />
              {f.label}
            </div>
          ))}
        </div>
      </section>
    </main>
    <Footer />
  </div>
);

export default Detect;
