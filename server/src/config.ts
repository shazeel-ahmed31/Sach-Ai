import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_PATH: z.string().default("./data/sach.db"),
  JWT_SECRET: z.string().min(32).optional(),
  ALLOW_DEMO_FALLBACK: z.enum(["true", "false"]).default("false"),
  HOST: z.string().default("127.0.0.1"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(720),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CLIENT_ORIGIN: z.string().default("http://localhost:8080"),
  ML_SERVICE_URL: z.string().default("http://127.0.0.1:8600"),
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  SEQUENCE_LENGTH: z.coerce
    .number()
    .int()
    .refine((n) => [10, 20, 40, 60, 80, 100].includes(n), {
      message: "SEQUENCE_LENGTH must be 10, 20, 40, 60, 80 or 100",
    })
    .default(20),
  MAX_VIDEO_MB: z.coerce.number().int().positive().default(200),
  NODE_ENV: z.string().optional().default("development"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail loudly at boot: a backend that starts with unknown config is worse
  // than one that does not start at all.
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === "production" && (!env.JWT_SECRET || /change.me|development.secret/i.test(env.JWT_SECRET))) {
  throw new Error("Production requires a random JWT_SECRET of at least 32 characters.");
}
if (env.NODE_ENV === "production" && env.ALLOW_DEMO_FALLBACK === "true") {
  throw new Error("Simulated detection is disabled in production.");
}
// Local development can start without sharing a predictable signing key.
const jwtSecret = env.JWT_SECRET ?? crypto.randomBytes(48).toString("base64url");

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  port: env.PORT,
  host: env.HOST,
  trustProxyHops: env.TRUST_PROXY_HOPS,
  allowDemoFallback: env.ALLOW_DEMO_FALLBACK === "true",
  databasePath: path.resolve(process.cwd(), env.DATABASE_PATH),
  clientOrigin: env.CLIENT_ORIGIN,
  auth: {
    jwtSecret,
    accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    /** Cookies are scoped so they only travel with API requests. */
    accessCookie: "sach_access",
    refreshCookie: "sach_refresh",
  },
  /** Python inference service running the pre-trained ResNeXt+LSTM model. */
  ml: {
    url: env.ML_SERVICE_URL.replace(/\/$/, ""),
    timeoutMs: env.ML_TIMEOUT_MS,
    sequenceLength: env.SEQUENCE_LENGTH,
  },
  uploads: {
    maxVideoBytes: env.MAX_VIDEO_MB * 1024 * 1024,
    allowedExtensions: new Set(["mp4", "mov", "webm", "avi", "mkv", "gif", "3gp", "wmv", "flv", "m4v"]),
    tempDir: path.resolve(process.cwd(), "./temp"),
  },
} as const;

export const newId = (prefix: string): string =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
