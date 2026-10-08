import logo from "@/assets/logo.jpg";
import { GraduationCap } from "lucide-react";

const team = [
  { name: "Shazeel Ahmed", id: "FA22-CSE-030" },
  { name: "Abdullah Nawaz", id: "FA22-CSE-086" },
  { name: "Jalal Mirza", id: "FA22-CSE-037" },
];

const Footer = () => (
  <footer className="border-t border-border/60 bg-background/60 mt-24">
    <div className="container py-12 grid gap-10 md:grid-cols-3 text-sm">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-transparent">
            <img
              src={logo}
              alt="Sach AI logo"
              width={1536}
              height={1024}
              className="w-full h-auto"
            />
          </div>
          <span className="font-bold text-base">Sach AI</span>
        </div>
        <p className="text-muted-foreground max-w-xs leading-relaxed">
          Restoring <span className="text-primary font-semibold">Truth</span> to your screen.
          A forensic deepfake detection platform.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-mono text-primary">
          <GraduationCap className="h-3.5 w-3.5" />
          BSc Computer Systems Engineering
        </div>
      </div>

      <div>
        <div className="font-semibold mb-3">Project Team</div>
        <ul className="space-y-2 text-muted-foreground">
          {team.map((m) => (
            <li key={m.id} className="flex items-center justify-start gap-3">
              <span className="text-foreground">{m.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{m.id}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
            Supervisor
          </div>
          <div className="mt-1 text-foreground">Dr. Ashfaq Ahmed</div>
        </div>
      </div>

      <div>
        <div className="font-semibold mb-3">Department</div>
        <p className="text-muted-foreground leading-relaxed">
          Department of Computer Systems Engineering
          <br />
          Faculty of Engineering and Technology
          <br />
          <span className="text-foreground font-medium">
            Mirpur University of Science and Technology (MUST)
          </span>
        </p>
        <div className="mt-3 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
          Final Year Project · 2026
        </div>
      </div>
    </div>

    <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground font-mono">
      © {new Date().getFullYear()} Sach AI · MUST · Academic Project
    </div>
  </footer>
);

export default Footer;
