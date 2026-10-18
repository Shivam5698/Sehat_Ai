import type { Request, RequestHandler, Response } from "express";
import {
  AIServiceUnavailableError,
  InvalidAIResponseError,
  safeErrorName,
  type OrchestrationResult,
} from "../services/aiResponseBoundary.js";
import type { TranscriptHistoryEntry } from "../types/consultation.js";

type ConsultationOwner = {
  userId: string | null;
  guestSessionId?: string | null;
  language?: string | null;
};

type TranscriptControllerDependencies = {
  findConsultation: (consultationId: string) => Promise<ConsultationOwner | null>;
  persistPatientTranscript?: (
    consultationId: string,
    transcript: string,
    language: string,
  ) => Promise<void>;
  sendTranscript: (
    consultationId: string,
    transcript: string,
    language: string,
    history: TranscriptHistoryEntry[],
  ) => Promise<OrchestrationResult>;
  failureMessage: string;
  logFailure?: (errorName: string) => void;
};

export function createTranscriptController(
  dependencies: TranscriptControllerDependencies,
): RequestHandler {
  return async (req: Request, res: Response) => {
    const userId = (req as Request & { user?: { sub?: unknown } }).user?.sub;
    const guestSessionId = (req as Request & { guestSessionId?: unknown }).guestSessionId;
    if (
      !(typeof userId === "string" && userId) &&
      !(typeof guestSessionId === "string" && guestSessionId)
    ) {
      return res.status(401).json({ ok: false, message: "Authentication required" });
    }

    const body = isRecord(req.body) ? req.body : {};
    const consultationId = body.consultationId;
    const transcript = body.transcript;
    const language = body.language;
    const history = body.history;
    if (
      typeof consultationId !== "string" ||
      !consultationId.trim() ||
      typeof transcript !== "string" ||
      !transcript.trim()
    ) {
      return res.status(400).json({ ok: false, message: "Missing consultationId or transcript" });
    }
    if (
      (language !== undefined && typeof language !== "string") ||
      (history !== undefined && !isTranscriptHistory(history))
    ) {
      return res.status(400).json({ ok: false, message: "Invalid transcript request" });
    }

    try {
      const consultation = await dependencies.findConsultation(consultationId);
      const isOwner = userId
        ? consultation?.userId === userId
        : typeof guestSessionId === "string" &&
          consultation?.userId === null &&
          consultation.guestSessionId === guestSessionId;
      if (!consultation || !isOwner) {
        return res.status(403).json({ ok: false, message: "Unauthorized" });
      }

      const effectiveLanguage =
        (typeof language === "string" && language) || consultation.language || "en";
      if (dependencies.persistPatientTranscript) {
        await dependencies.persistPatientTranscript(consultationId, transcript, effectiveLanguage);
      }

      const validatedResponse = await dependencies.sendTranscript(
        consultationId,
        transcript,
        effectiveLanguage,
        Array.isArray(history) ? history : [],
      );
      return res.json({ ok: true, validatedResponse });
    } catch (error) {
      (dependencies.logFailure ?? defaultSafeFailureLog)(safeErrorName(error));
      const invalidResponse = error instanceof InvalidAIResponseError;
      const serviceUnavailable = error instanceof AIServiceUnavailableError;
      return res.status(invalidResponse ? 502 : serviceUnavailable ? 503 : 500).json({
        ok: false,
        message: dependencies.failureMessage,
        ...(invalidResponse && error.shouldEscalate ? { shouldEscalate: true } : {}),
      });
    }
  };
}

function isTranscriptHistory(value: unknown): value is TranscriptHistoryEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        (entry.speaker === "patient" || entry.speaker === "ai" || entry.speaker === "system") &&
        typeof entry.text === "string" &&
        (entry.language === undefined || typeof entry.language === "string") &&
        (entry.timestamp === undefined ||
          (typeof entry.timestamp === "string" && Number.isFinite(Date.parse(entry.timestamp)))),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultSafeFailureLog(errorName: string): void {
  console.error("Transcript processing failed", { errorName });
}
