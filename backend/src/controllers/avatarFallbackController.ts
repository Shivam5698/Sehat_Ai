import type { RequestHandler } from "express";

export function createAvatarUnavailableHandler(message: string): RequestHandler {
  return (_req, res) =>
    res.status(503).json({
      ok: false,
      message,
    });
}
