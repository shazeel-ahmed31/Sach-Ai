import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { History, Layers, LogOut, ScanSearch } from "lucide-react";
import logo from "@/assets/logo.jpg";
import { useAuth } from "@/auth/AuthProvider";

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const linkBase = "text-sm font-medium transition-colors hover:text-primary";
  const linkActive = "text-primary";
  const linkIdle = "text-muted-foreground";

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-transparent transition-transform group-hover:scale-105">
            <img
              src={logo}
              alt="Sach AI logo"
              width={1536}
              height={1024}
              className="w-full h-auto"
            />
          </div>
          <div className="leading-tight">
            <div className="font-bold tracking-tight">Sach AI</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
              Forensic Lab
            </div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/" end className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
            Home
          </NavLink>
          <NavLink to="/detect" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
            Detect
          </NavLink>
          <NavLink to="/batch" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
            Batch Scan
          </NavLink>
          <NavLink to="/report" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
            Sample Report
          </NavLink>
          <NavLink to="/research" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
            Research
          </NavLink>
          {user && (
            <NavLink to="/history" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
              History
            </NavLink>
          )}
        </nav>

        {user ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card/60 py-1.5 pl-1.5 pr-3 text-sm hover:border-primary/40 transition-colors"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-emerald text-xs font-bold text-primary-foreground">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:inline max-w-[120px] truncate">{user.name}</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-elegant"
              >
                <div className="border-b border-border px-4 py-3">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                </div>
                <Link
                  to="/detect"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary/60"
                >
                  <ScanSearch className="h-4 w-4 text-primary" /> Verify a video
                </Link>
                <Link
                  to="/batch"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary/60"
                >
                  <Layers className="h-4 w-4 text-primary" /> Batch scan
                </Link>
                <Link
                  to="/history"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary/60"
                >
                  <History className="h-4 w-4 text-primary" /> Scan history
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center rounded-lg border border-border bg-card/60 px-3.5 py-2 text-sm font-medium hover:border-primary/40 transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center rounded-lg bg-gradient-emerald px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant transition-transform hover:scale-[1.03]"
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
