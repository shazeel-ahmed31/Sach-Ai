import { Router } from "express";
import { engineStatus } from "../lib/engine.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const engine = await engineStatus();
  res.json({
    status: "ok",
    service: "sach-ai-api",
    time: new Date().toISOString(),
    engine,
  });
});
