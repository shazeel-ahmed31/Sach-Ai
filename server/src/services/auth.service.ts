import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, type UserRow } from "../db/index.js";
import { config, newId } from "../config.js";
import { AppError } from "../lib/errors.js";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export const toPublicUser = (row: UserRow): PublicUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at,
});

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessExpiresInMs: number;
  refreshExpiresInMs: number;
};

const BCRYPT_ROUNDS = 10;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

const signAccessToken = (user: Pick<UserRow, "id" | "email">) =>
  jwt.sign({ sub: user.id, email: user.email }, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTokenTtlMinutes * 60,
  });

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const insertRefreshToken = (userId: string, ttlDays: number): string => {
  const token = crypto.randomBytes(48).toString("base64url");
  const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  db.prepare(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(newId("rt"), userId, sha256(token), expiresAt, new Date().toISOString());
  return token;
};

/** Rotate: the presented refresh token is revoked and a fresh pair issued. */
const rotateRefreshToken = (presentedToken: string): { userId: string; refreshToken: string } => {
  const tokenHash = sha256(presentedToken);
  const row = db
    .prepare(
      "SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?",
    )
    .get(tokenHash) as
    | { id: string; user_id: string; expires_at: number; revoked_at: string | null }
    | undefined;

  if (!row) throw AppError.unauthorized("Session expired. Please sign in again.");
  if (row.revoked_at) {
    // Reuse of a revoked token is the classic refresh-theft signal; kill the
    // whole family for this user.
    db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(
      new Date().toISOString(),
      row.user_id,
    );
    throw AppError.unauthorized("Session expired. Please sign in again.");
  }
  if (row.expires_at < Date.now()) throw AppError.unauthorized("Session expired. Please sign in again.");

  db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  const refreshToken = insertRefreshToken(row.user_id, config.auth.refreshTokenTtlDays);
  return { userId: row.user_id, refreshToken };
};

export const revokeRefreshToken = (presentedToken: string | undefined) => {
  if (!presentedToken) return;
  db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?").run(
    new Date().toISOString(),
    sha256(presentedToken),
  );
};

const purgeStaleTokens = () => {
  // expires_at is epoch-ms; revoked_at is an ISO timestamp.
  const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  db.prepare(
    "DELETE FROM refresh_tokens WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)",
  ).run(cutoffMs, cutoffIso);
};

export const issueTokens = (user: Pick<UserRow, "id" | "email">): TokenPair => ({
  accessToken: signAccessToken(user),
  refreshToken: insertRefreshToken(user.id, config.auth.refreshTokenTtlDays),
  accessExpiresInMs: config.auth.accessTokenTtlMinutes * 60 * 1000,
  refreshExpiresInMs: config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
});

export const getUserById = (id: string): UserRow | undefined =>
  db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;

export const getUserByEmail = (email: string): UserRow | undefined =>
  db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email) as UserRow | undefined;

export const registerUser = async (input: {
  email: string;
  password: string;
  name: string;
}): Promise<UserRow> => {
  if (getUserByEmail(input.email)) {
    throw AppError.conflict("An account with this email already exists");
  }
  const user: UserRow = {
    id: newId("usr"),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    password_hash: await hashPassword(input.password),
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(user.id, user.email, user.name, user.password_hash, user.created_at);
  return user;
};

/** Single generic failure message so the endpoint cannot be used to enumerate accounts. */
export const authenticateUser = async (email: string, password: string): Promise<UserRow> => {
  const user = getUserByEmail(email);
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) throw AppError.unauthorized("Invalid email or password");
  return user;
};

export const refreshSession = (presentedToken: string | undefined): { user: UserRow; tokens: TokenPair } => {
  if (!presentedToken) throw AppError.unauthorized("Session expired. Please sign in again.");
  const { userId, refreshToken } = rotateRefreshToken(presentedToken);
  const user = getUserById(userId);
  if (!user) throw AppError.unauthorized("Session expired. Please sign in again.");
  return { user, tokens: issueTokens(user) };
};

// Opportunistic cleanup of long-expired tokens; cheap and keeps the table small.
setInterval(purgeStaleTokens, 6 * 60 * 60 * 1000).unref();
