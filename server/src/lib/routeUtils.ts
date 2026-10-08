import { AppError } from "./errors.js";

/**
 * Express 4 does not catch rejected promises from async handlers; this wrapper
 * funnels them into the central error handler.
 */
type AsyncHandler = (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<unknown>;

export const asyncRouteSafe = (fn: AsyncHandler) =>
  (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    fn(req, res, next).catch(next);
  };

export { AppError };
