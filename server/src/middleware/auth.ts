import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { getUserById } from "../services/auth.service.js";
import { AppError } from "../lib/errors.js";

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

const readToken = (req: Request): string | null => {
  const cookie = req.cookies?.[config.auth.accessCookie];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
};

/** Verifies the access token and resolves the user for every authenticated request. */
export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = readToken(req);
    if (!token) throw AppError.unauthorized();
    const payload = jwt.verify(token, config.auth.jwtSecret) as { sub?: string };
    if (!payload.sub) throw AppError.unauthorized("Invalid session token");

    const row = getUserById(payload.sub);
    if (!row) throw AppError.unauthorized("Account no longer exists");

    req.user = { id: row.id, email: row.email, name: row.name };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(AppError.unauthorized("Session token expired"));
    } else if (err instanceof jwt.JsonWebTokenError) {
      next(AppError.unauthorized("Invalid session token"));
    } else {
      next(err);
    }
  }
};
