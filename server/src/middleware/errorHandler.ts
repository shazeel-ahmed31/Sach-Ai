import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ error: { code: "not_found", message: `No route for ${req.method} ${req.path}` } });
};

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const isTooLarge = err.code === "LIMIT_FILE_SIZE";
    const message = isTooLarge
      ? `The video exceeds the ${Math.round(config.uploads.maxVideoBytes / 1024 / 1024)} MB size limit`
      : err.code === "LIMIT_UNEXPECTED_FILE"
        ? "Unexpected upload field - attach the video in a 'video' field"
        : `Upload rejected: ${err.message}`;
    res.status(isTooLarge ? 413 : 400).json({
      error: { code: isTooLarge ? "payload_too_large" : "upload_error", message },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Invalid request payload",
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  console.error("[unhandled]", err);
  res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong on the server" },
  });
};

