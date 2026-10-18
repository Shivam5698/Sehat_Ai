import type { AIDoctorTranscriptRequest, TranscriptResponse } from "../types/aiDoctor.ts";

type ConsultationResponse = {
  session?: { id?: string };
};

type WorkflowApi = {
  startConsultation(language: string): Promise<ConsultationResponse>;
  sendTranscript(
    consultationId: string,
    text: string,
    language: string,
    history: AIDoctorTranscriptRequest["history"],
  ): Promise<TranscriptResponse>;
};

type StatusError = { status: number; name?: string };

export type ConsultationStartResult = {
  consultationId: string;
  avatarAvailable: boolean;
};

export type TranscriptSubmissionResult =
  | { status: "success"; response: TranscriptResponse }
  | { status: "failed"; error: unknown; retryable: boolean }
  | { status: "pending" }
  | { status: "unconfirmed" };

export class AiDoctorWorkflow {
  private readonly api: WorkflowApi;
  private startPromise: Promise<ConsultationStartResult> | undefined;
  private startRetryAllowed = false;
  private consultationId: string | undefined;
  private submissionPending = false;
  private readonly uncertainTranscripts = new Set<string>();
  private readonly retryableTranscripts = new Set<string>();

  constructor(api: WorkflowApi) {
    this.api = api;
  }

  start(language: string): Promise<ConsultationStartResult> {
    if (this.startPromise && !this.startRetryAllowed) return this.startPromise;
    if (this.startRetryAllowed) {
      this.startPromise = undefined;
      this.startRetryAllowed = false;
    }
    this.startPromise = this.startOnce(language);
    return this.startPromise;
  }

  async submit(
    text: string,
    language: string,
    history: AIDoctorTranscriptRequest["history"],
  ): Promise<TranscriptSubmissionResult> {
    const consultationId = this.consultationId;
    if (!consultationId)
      return { status: "failed", error: new Error("Consultation not started."), retryable: false };
    if (this.submissionPending) return { status: "pending" };

    const key = `${consultationId}\u0000${text}`;
    if (this.uncertainTranscripts.has(key)) return { status: "unconfirmed" };

    this.submissionPending = true;
    try {
      const response = await this.api.sendTranscript(consultationId, text, language, history);
      this.retryableTranscripts.delete(key);
      return { status: "success", response };
    } catch (error) {
      const retryable = isStatusError(error) && error.status === 401;
      if (retryable) {
        this.retryableTranscripts.add(key);
      } else {
        this.retryableTranscripts.delete(key);
        this.uncertainTranscripts.add(key);
      }
      return { status: "failed", error, retryable };
    } finally {
      this.submissionPending = false;
    }
  }

  canRetry(text: string): boolean {
    return (
      this.consultationId !== undefined &&
      this.retryableTranscripts.has(`${this.consultationId}\u0000${text}`)
    );
  }

  canRetryStart(): boolean {
    return this.startRetryAllowed;
  }

  canSubmit(text: string): "ready" | "retry" | "unconfirmed" {
    const key = `${this.consultationId ?? ""}\u0000${text}`;
    if (this.uncertainTranscripts.has(key)) return "unconfirmed";
    return this.retryableTranscripts.has(key) ? "retry" : "ready";
  }

  private async startOnce(language: string): Promise<ConsultationStartResult> {
    try {
      const response = await this.api.startConsultation(language);
      const consultationId = response.session?.id;
      if (!consultationId) throw new Error("The consultation could not be created.");
      this.consultationId = consultationId;

      return { consultationId, avatarAvailable: false };
    } catch (error) {
      this.startRetryAllowed = isStatusError(error) && error.status === 401;
      throw error;
    }
  }
}

function isStatusError(error: unknown): error is StatusError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status === 401 &&
    "name" in error &&
    error.name === "ApiError"
  );
}
