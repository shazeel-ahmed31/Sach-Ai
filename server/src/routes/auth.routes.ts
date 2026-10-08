import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { AppError, asyncRouteSafe } from "../lib/routeUtils.js";
import {
  authenticateUser,
  issueTokens,
  refreshSession,
  registerUser,
  revokeRefreshToken,
  toPublicUser,
} from "../services/auth.service.js";
import { requireAuth } from "../middleware/auth.js";
import type { Request, Response } from "express";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many attempts, try again later" } },
});

const credentials = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(8, "Password must be at least 8 characters").max(128)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes"),
  })
  .strict();

const registerSchema = credentials.extend({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
});

const cookieOptions = (maxAgeMs: number, path: string) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProduction,
  maxAge: maxAgeMs,
  path,
});

const setAuthCookies = (res: Response, tokens: ReturnType<typeof issueTokens>) => {
  res.cookie(config.auth.accessCookie, tokens.accessToken, cookieOptions(tokens.accessExpiresInMs, "/"));
  res.cookie(
    config.auth.refreshCookie,
    tokens.refreshToken,
    cookieOptions(tokens.refreshExpiresInMs, "/api/auth"),
  );
};

export const authRouter = Router();
authRouter.use(authLimiter);

authRouter.post(
  "/register",
  asyncRouteSafe(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const user = await registerUser(body);
    const tokens = issueTokens(user);
    setAuthCookies(res, tokens);
    res.status(201).json({ user: toPublicUser(user) });
  }),
);

authRouter.post(
  "/login",
  asyncRouteSafe(async (req, res) => {
    const body = credentials.parse(req.body);
    const user = await authenticateUser(body.email, body.password);
    const tokens = issueTokens(user);
    setAuthCookies(res, tokens);
    res.json({ user: toPublicUser(user) });
  }),
);

authRouter.post(
  "/refresh",
  asyncRouteSafe(async (req, res) => {
    const { user, tokens } = refreshSession(req.cookies?.[config.auth.refreshCookie]);
    setAuthCookies(res, tokens);
    res.json({ user: toPublicUser(user) });
  }),
);

authRouter.post(
  "/logout",
  (req: Request, res: Response) => {
    revokeRefreshToken(req.cookies?.[config.auth.refreshCookie]);
    res.clearCookie(config.auth.accessCookie, { path: "/" });
    res.clearCookie(config.auth.refreshCookie, { path: "/api/auth" });
    res.status(204).end();
  },
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
