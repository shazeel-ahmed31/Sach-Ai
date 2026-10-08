import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogIn, UserPlus, Loader2, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/auth/AuthProvider";
import { ApiError } from "@/services/api";

const Auth = ({ mode }: { mode: "login" | "register" }) => {
  const isLogin = mode === "login";
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/detect";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (isLogin) await login(email, password);
      else await register(name, email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details && typeof err.details === "object") {
          setFieldErrors(err.details as Record<string, string[]>);
        }
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center container py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="rounded-2xl border border-primary/30 bg-card/80 p-8 scanline">
            <div className="flex items-center justify-center gap-2 mb-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-mono text-[10px] uppercase tracking-[0.25em]">
                Sach-AI Forensic Lab
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-center">
              {isLogin ? (
                <>
                  Welcome <span className="text-gradient-emerald">back</span>
                </>
              ) : (
                <>
                  Create your <span className="text-gradient-emerald">lab account</span>
                </>
              )}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground text-center">
              {isLogin
                ? "Sign in to run scans, keep your scan history and verify clips in batches."
                : "An account keeps every Truth Report you run in one private history."}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {!isLogin && (
                <div>
                  <label htmlFor="name" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    placeholder="Ada Lovelace"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-xs text-destructive">{fieldErrors.name[0]}</p>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="email" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-destructive">{fieldErrors.email[0]}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder={isLogin ? "Your password" : "At least 8 characters"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                />
                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-destructive">{fieldErrors.password[0]}</p>
                )}
              </div>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-mono text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-emerald px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isLogin ? (
                  <LogIn className="h-4 w-4" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {isLogin ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {isLogin ? (
                <>
                  New here?{" "}
                  <Link to="/register" className="text-primary font-medium hover:underline">
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary font-medium hover:underline">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export const LoginPage = () => <Auth mode="login" />;
export const RegisterPage = () => <Auth mode="register" />;
