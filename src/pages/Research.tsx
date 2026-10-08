import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LiteratureTable from "@/components/LiteratureTable";
import { BookOpen } from "lucide-react";

const Research = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1 container py-16 space-y-20">
      <section>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mb-8"
        >
          <div className="inline-flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-[0.2em] mb-2">
            <BookOpen className="h-3.5 w-3.5" /> Literature Review
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">The papers we stand on.</h1>
          <p className="mt-3 text-muted-foreground">
            The three streams of Sach AI, Spatial, Temporal, and Audio Sync, are grounded in recent peer reviewed
            work. Below are the most influential references in our consensus design.
          </p>
        </motion.div>
        <LiteratureTable />
      </section>

    </main>
    <Footer />
  </div>
);

export default Research;
