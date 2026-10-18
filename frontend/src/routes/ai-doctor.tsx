import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Languages,
  Activity,
  ShieldAlert,
  AlertTriangle,
  Stethoscope,
  Sparkles,
  Send,
  LoaderCircle,
} from "lucide-react";
import aiDoctor from "@/assets/ai-doctor.jpg";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { consultationAPI, videoAPI } from "@/services/api/client";
import { AiDoctorWorkflow } from "@/lib/ai-doctor-workflow";
import { ApiError, type AIDoctorSymptom, type AIDoctorTranscriptRequest } from "@/types/aiDoctor";

type ConversationMessage = {
  speaker: "patient";
  text: string;
  language: string;
  timestamp: string;
  delivery: "sending" | "sent" | "not-sent" | "unconfirmed";
};

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export const Route = createFileRoute("/ai-doctor")({
  head: () => ({
    meta: [
      { title: "AI Doctor Text Consultation | Sehat AI" },
      {
        name: "description",
        content:
          "Text consultation with optional browser voice input. Assessment availability depends on validated backend services.",
      },
      { property: "og:title", content: "AI Doctor Text Consultation — Sehat AI" },
      {
        property: "og:description",
        content: "Text consultation with optional browser voice input and validated backend responses.",
      },
    ],
  }),
  component: AiDoctorPage,
});

function AiDoctorPage() {
  return <AiDoctorConsultation />;
}

function AiDoctorConsultation() {
  const [muted, setMuted] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [callState, setCallState] = useState<
    "idle" | "connecting" | "connected" | "ending" | "ended" | "error"
  >("idle");
  const [callError, setCallError] = useState("");
  const [deviceError, setDeviceError] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [retryableMessage, setRetryableMessage] = useState<{
    text: string;
    history: AIDoctorTranscriptRequest["history"];
    timestamp: string;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const [consultationId, setConsultationId] = useState("");
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [riskLevel, setRiskLevel] = useState("");
  const [detectedSymptoms, setDetectedSymptoms] = useState<AIDoctorSymptom[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [emergencyMessage, setEmergencyMessage] = useState("");
  const [assessmentReceived, setAssessmentReceived] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const consultationIdRef = useRef("");
  const workflowRef = useRef<AiDoctorWorkflow | null>(null);
  const callActiveRef = useRef(false);
  const mountedRef = useRef(false);
  const mutedRef = useRef(true);
  const processingRef = useRef(false);
  const retryRequiredRef = useRef(false);
  const { t, i18n } = useTranslation(["common", "ai"]);
  if (!workflowRef.current) {
    workflowRef.current = createWorkflow();
  }
  const voiceInputAvailable =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      callActiveRef.current = false;
      recognitionRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  const processPatientMessage = async (rawText: string, retry = false) => {
    const text = rawText.trim();
    const workflow = workflowRef.current;
    if (!text || !consultationIdRef.current || !workflow || processingRef.current) return;
    const submissionState = workflow.canSubmit(text);
    if (!retry && submissionState === "unconfirmed") {
      setSubmissionError(
        "We could not confirm the previous request. It may already be saved, so it was not sent again. Please enter a new message to continue.",
      );
      return;
    }
    if (!retry && submissionState === "retry") {
      setSubmissionError("Use the retry button to safely resend this message.");
      return;
    }
    if (!retry && retryableMessage) {
      setSubmissionError("Retry or resolve the earlier unsent message before sending another.");
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);
    setIsListening(false);
    setSubmissionError("");
    setDetectedSymptoms([]);
    setRecommendations([]);
    setRiskScore(null);
    setRiskLevel("");
    setEmergencyMessage("");
    setAssessmentReceived(false);
    const retryDetails = retry ? retryableMessage : null;
    const patientMessage: ConversationMessage | null = retry
      ? null
      : {
          speaker: "patient",
          text,
          language: i18n.language,
          timestamp: new Date().toISOString(),
          delivery: "sending",
        };
    const historyMessages = retryDetails?.history ?? [
      ...messagesRef.current.filter((message) => message.delivery !== "not-sent"),
      ...(patientMessage ? [patientMessage] : []),
    ];
    if (patientMessage) {
      messagesRef.current = [...messagesRef.current, patientMessage];
      setMessages(messagesRef.current);
      setRetryableMessage(null);
    }
    const history: AIDoctorTranscriptRequest["history"] = historyMessages?.map(
      ({ speaker, text: messageText, language, timestamp }) => ({
        speaker,
        text: messageText,
        language,
        timestamp,
      }),
    );
    setDraft("");

    try {
      const result = await workflow.submit(text, i18n.language, history);
      if (!mountedRef.current) return;
      if (result.status === "pending") {
        setSubmissionError("A message is already being processed. Please wait for it to finish.");
        return;
      }
      if (result.status === "unconfirmed") {
        setSubmissionError(
          "We could not confirm the previous request. It may already be saved, so it was not sent again. Please enter a new message to continue.",
        );
        return;
      }
      if (result.status === "failed") {
        if (result.error instanceof ApiError && result.error.shouldEscalate) {
          setEmergencyMessage(
            result.error.emergencyMessage ||
              "Emergency escalation was indicated. Contact local emergency services now.",
          );
        }
        const errorText =
          result.error instanceof ApiError && result.error.status === 401
            ? "Your sign-in has expired. Sign in again, then retry this message."
            : result.error instanceof ApiError && result.error.status >= 500
              ? result.error.message
              : result.error instanceof ApiError
                ? result.error.message
                : "We couldn't get a response from the AI service.";
        setSubmissionError(
          result.retryable
            ? errorText
            : `${errorText} This message may already be saved and will not be sent again.`,
        );
        const failedTimestamp = retryDetails?.timestamp ?? patientMessage?.timestamp;
        if (failedTimestamp) {
          const delivery: ConversationMessage["delivery"] = result.retryable
            ? "not-sent"
            : "unconfirmed";
          const updatedMessages = messagesRef.current.map((message) =>
            message.timestamp === failedTimestamp ? { ...message, delivery } : message,
          );
          messagesRef.current = updatedMessages;
          setMessages(updatedMessages);
          if (result.retryable && patientMessage) {
            setRetryableMessage({ text, history, timestamp: patientMessage.timestamp });
            retryRequiredRef.current = true;
          }
        }
        if (retry && !result.retryable) {
          setRetryableMessage(null);
          retryRequiredRef.current = false;
        }
        return;
      }
      if (!callActiveRef.current) return;
      const assessment = result.response.validatedResponse;
      const sentTimestamp = retryDetails?.timestamp ?? patientMessage?.timestamp;
      if (sentTimestamp) {
        const updatedMessages = messagesRef.current.map((message) =>
          message.timestamp === sentTimestamp ? { ...message, delivery: "sent" as const } : message,
        );
        messagesRef.current = updatedMessages;
        setMessages(updatedMessages);
      }
      setRetryableMessage(null);
      retryRequiredRef.current = false;
      setDetectedSymptoms(Array.isArray(assessment.symptoms) ? assessment.symptoms : []);
      setRecommendations(
        Array.isArray(assessment.recommendations) ? assessment.recommendations : [],
      );
      setEmergencyMessage(
        assessment.shouldEscalate === true
          ? typeof assessment.emergencyMessage === "string"
            ? assessment.emergencyMessage
            : "Emergency escalation was indicated. Contact local emergency services now."
          : "",
      );
      setRiskScore(
        typeof assessment?.riskAssessment?.riskScore === "number"
          ? assessment.riskAssessment.riskScore
          : null,
      );
      setRiskLevel(
        typeof assessment?.riskAssessment?.level === "string"
          ? assessment.riskAssessment.level
          : "",
      );
      setAssessmentReceived(true);
      setSubmissionError("");
    } catch (error) {
      setSubmissionError(
        error instanceof ApiError ? error.message : "We couldn't submit your message.",
      );
    } finally {
      processingRef.current = false;
      if (mountedRef.current) {
        setIsProcessing(false);
        if (callActiveRef.current && !mutedRef.current && !retryRequiredRef.current) {
          window.setTimeout(() => startVoiceCapture(), 300);
        }
      }
    }
  };

  const retryPatientMessage = () => {
    if (retryableMessage && workflowRef.current?.canRetry(retryableMessage.text)) {
      void processPatientMessage(retryableMessage.text, true);
    }
  };

  const startVoiceCapture = () => {
    if (
      !callActiveRef.current ||
      mutedRef.current ||
      processingRef.current ||
      retryRequiredRef.current ||
      recognitionRef.current
    )
      return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setDeviceError(
        "Voice input is not supported in this browser. You can type a message instead.",
      );
      return;
    }

    const recognition = new Recognition();
    recognition.lang = i18n.language;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const recognizedText = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();
      if (!recognizedText) return;
      recognition.stop();
      void processPatientMessage(recognizedText);
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setDeviceError(`Voice input failed: ${event.error}. You can type a message instead.`);
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setIsListening(false);
      if (callActiveRef.current && !mutedRef.current && !processingRef.current) {
        window.setTimeout(() => startVoiceCapture(), 300);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setDeviceError("");
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      setDeviceError("Could not start voice input. You can type a message instead.");
    }
  };

  const startCall = async () => {
    if (callState === "connecting" || callState === "connected") return;
    if (callState === "error" && !workflowRef.current?.canRetryStart()) return;
    if (callState === "ended") workflowRef.current = createWorkflow();
    setCallError("");
    setDeviceError("");
    setAvatarError("");
    setSubmissionError("");
    setCallState("connecting");
    setCameraLoading(false);
    mutedRef.current = true;
    setMuted(true);
    setCamOn(false);
    messagesRef.current = [];
    setMessages([]);
    setRiskScore(null);
    setRiskLevel("");
    setDetectedSymptoms([]);
    setRecommendations([]);
    setEmergencyMessage("");
    setAssessmentReceived(false);
    retryRequiredRef.current = false;
    try {
      const activeWorkflow = workflowRef.current;
      const startResult = await activeWorkflow?.start(i18n.language);
      if (!mountedRef.current) return;
      if (!startResult) throw new Error("The consultation could not be created.");
      consultationIdRef.current = startResult.consultationId;
      setConsultationId(startResult.consultationId);
      callActiveRef.current = true;
      setCallState("connected");
      setAvatarError(
        "Avatar unavailable: a verified approved-response integration is not configured. Text consultation is active.",
      );
    } catch (error) {
      callActiveRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      if (!mountedRef.current) return;
      setMediaStream(null);
      setCameraLoading(false);
      setCallError(
        error instanceof ApiError && error.status === 401
          ? "Your sign-in has expired. Sign in again, then retry consultation setup."
          : "We couldn't confirm that the consultation started. It won't be retried automatically to avoid creating a duplicate.",
      );
      setCallState("error");
    } finally {
      if (mountedRef.current) setCameraLoading(false);
    }
  };

  const endCall = async () => {
    if (callState !== "connected") return;
    setCallState("ending");
    callActiveRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setMediaStream(null);

    const results = await Promise.allSettled(
      consultationIdRef.current ? [consultationAPI.end(consultationIdRef.current)] : [],
    );
    if (!mountedRef.current) return;
    const failures = results.flatMap((result) =>
      result.status === "rejected"
        ? [result.reason instanceof Error ? result.reason.message : "A session could not be ended."]
        : [],
    );
    setCallError(failures.length ? failures.join("; ") : "");
    consultationIdRef.current = "";
    setConsultationId("");
    setAvatarError("");
    setDetectedSymptoms([]);
    setCallState("ended");
    setIsListening(false);
  };

  const handleToggleMic = () => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    setDeviceError("");
    if (nextMuted) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
    } else {
      startVoiceCapture();
    }
  };

  const handleToggleCam = async () => {
    if (camOn) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setMediaStream(null);
      setCamOn(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setDeviceError("Camera access is unavailable in this browser.");
      return;
    }

    setDeviceError("");
    setCameraLoading(true);
    const activeConsultationId = consultationIdRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (
        !mountedRef.current ||
        !callActiveRef.current ||
        consultationIdRef.current !== activeConsultationId
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      setMediaStream(stream);
      setCamOn(true);
    } catch {
      if (mountedRef.current) {
        setDeviceError("Camera access was not granted. Text consultation is unaffected.");
      }
    } finally {
      if (mountedRef.current) setCameraLoading(false);
    }
  };

  const handleSendMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void processPatientMessage(draft);
  };

  return (
    <>
      <section className="bg-gradient-mint py-12">
        <div className="container mx-auto px-4">
          <SectionHeading
            eyebrow="24/7 AI Medical Assistant"
            title="Start Your Smart AI Consultation"
            subtitle="Speak naturally through voice, video, or chat while SehatAI understands symptoms and guides your healthcare journey in real time."
          />
        </div>
      </section>
      <div className="bg-section min-h-[calc(100vh-4rem)]">
        <div className="container mx-auto px-4 py-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl bg-card border border-border shadow-soft overflow-hidden flex flex-col">
            <div className="px-5 py-3 flex flex-col gap-3 border-b border-border bg-mint">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${callState === "connected" ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {callState === "connecting"
                      ? "Starting consultation"
                      : callState === "connected"
                        ? "Consultation active"
                        : "Not connected"}
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {t("doctorLabel", { ns: "ai" })}
                  </span>
                </div>
                <div className="rounded-full bg-background/80 px-3 py-2 text-sm text-foreground border border-border flex items-center gap-1.5">
                  <Languages className="h-4 w-4" /> {i18n.language}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div className="rounded-full bg-background/80 px-3 py-2 text-foreground border border-border">
                  Camera: {mediaStream && camOn ? "Active" : "Off"}
                </div>
                <div className="rounded-full bg-background/80 px-3 py-2 text-foreground border border-border">
                  Microphone: {muted ? "Off" : isListening ? "Active" : "On"}
                </div>
                <div className="rounded-full bg-background/80 px-3 py-2 text-foreground border border-border">
                  Status:{" "}
                  {isProcessing
                    ? "Processing"
                    : isListening
                      ? "Listening"
                      : callState === "connected"
                        ? "Ready"
                        : callState}
                </div>
                <div className="rounded-full bg-background/80 px-3 py-2 text-foreground border border-border">
                  Risk:{" "}
                  {riskScore === null
                    ? "Not assessed"
                    : `${riskLevel || "Assessed"} (${riskScore}/100)`}
                </div>
              </div>
            </div>

            <div className="relative aspect-video bg-mint">
              <img
                src={aiDoctor}
                alt="Static illustration; live avatar unavailable"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 grid place-items-end p-4">
                <span
                  role="status"
                  className="rounded-full bg-background/80 px-3 py-1.5 text-xs text-muted-foreground"
                >
                  {avatarError ||
                    "Optional avatar unavailable: provider-approved response presentation is not verified."}
                </span>
              </div>
              <div className="absolute top-4 right-4 rounded-2xl bg-background/80 backdrop-blur border border-border p-3 w-44 shadow-medical">
                <div className="text-[10px] uppercase text-muted-foreground">You</div>
                <div className="mt-1 aspect-video rounded-lg bg-foreground/80 overflow-hidden">
                  {cameraLoading ? (
                    <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                      Activating camera…
                    </div>
                  ) : mediaStream && camOn ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                      Camera off
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 flex items-center justify-center gap-3 border-t border-border">
              <Button
                onClick={handleToggleMic}
                disabled={callState !== "connected" || !voiceInputAvailable}
                variant={muted ? "destructive" : "secondary"}
                size="icon"
                className="rounded-full h-12 w-12"
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              >
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
              <Button
                onClick={() => void handleToggleCam()}
                disabled={callState !== "connected" || cameraLoading}
                variant={camOn ? "secondary" : "destructive"}
                size="icon"
                className="rounded-full h-12 w-12"
                aria-label={camOn ? "Turn camera off" : "Turn camera on"}
              >
                {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </Button>
              {callState === "connected" || callState === "ending" ? (
                <Button
                  onClick={() => void endCall()}
                  disabled={callState === "ending"}
                  size="icon"
                  className="rounded-full h-14 w-14 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  aria-label="End consultation"
                >
                  {callState === "ending" ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <Phone className="h-5 w-5 rotate-[135deg]" />
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => void startCall()}
                  disabled={
                    callState === "connecting" ||
                    (callState === "error" && !workflowRef.current?.canRetryStart())
                  }
                  className="rounded-full h-14 px-5 gap-2"
                >
                  {callState === "connecting" ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <Phone className="h-5 w-5" />
                  )}
                  {callState === "connecting"
                    ? "Connecting…"
                    : callState === "ended"
                      ? "Start another consultation"
                      : callState === "error"
                        ? "Retry after sign-in"
                        : "Start consultation"}
                </Button>
              )}
            </div>
            {(callError || submissionError || deviceError) && (
              <div
                role="alert"
                className="mx-5 mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                {callError && <p>{callError}</p>}
                {submissionError && <p>{submissionError}</p>}
                {deviceError && <p>{deviceError}</p>}
                {callState === "error" && workflowRef.current?.canRetryStart() && (
                  <a
                    href="/login"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block underline"
                  >
                    Sign in in another tab
                  </a>
                )}
                {retryableMessage && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isProcessing}
                      onClick={retryPatientMessage}
                    >
                      Retry message
                    </Button>
                    <a href="/login" target="_blank" rel="noreferrer" className="underline">
                      Sign in in another tab
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="p-5 border-t border-border bg-section">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" /> {t("liveTranscript", { ns: "ai" })}
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {messages.length ? (
                  messages.map((message, index) => (
                    <div key={`${message.timestamp}-${index}`} className="space-y-1">
                      <Bubble who={t("who.you")} text={message.text} mine />
                      {message.delivery !== "sent" && (
                        <p className="text-right text-xs text-muted-foreground">
                          {message.delivery === "sending"
                            ? "Sending…"
                            : message.delivery === "not-sent"
                              ? "Not sent — authentication required"
                              : "Delivery not confirmed — not resent"}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {callState === "connected"
                      ? "Your messages will appear here. Backend results are shown as structured fields; no assistant-reply text is currently provided."
                      : "Start a consultation to begin using text or optional voice input."}
                  </p>
                )}
              </div>
              {assessmentReceived && (
                <p className="mt-3 text-xs text-muted-foreground" role="status">
                  The backend returned a structured assessment. It does not include an
                  assistant-reply string. Software checks validate response structure only and do
                  not establish clinical validity.
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                This service cannot prescribe or recommend medicines. For medicine questions, speak
                with a qualified healthcare professional or pharmacist.
              </p>
              {emergencyMessage && (
                <div
                  role="alert"
                  className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  {emergencyMessage}
                </div>
              )}
              <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={callState !== "connected" || isProcessing || Boolean(retryableMessage)}
                  aria-label="Message the AI doctor"
                  placeholder="Type a message if you prefer…"
                  className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={
                    callState !== "connected" ||
                    isProcessing ||
                    Boolean(retryableMessage) ||
                    !draft.trim()
                  }
                  aria-label="Send message"
                >
                  {isProcessing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </div>

          <div className="space-y-5">
            <Panel title={t("panels.detectedSymptoms", { ns: "ai" })} icon={Activity}>
              {detectedSymptoms.length ? (
                <div className="flex flex-wrap gap-2">
                  {detectedSymptoms.map((symptom, index) => (
                    <span
                      key={`${symptom.id}-${index}`}
                      className="rounded-full bg-mint text-primary text-xs font-medium px-3 py-1.5 border border-border"
                    >
                      {symptom.name}
                      <span className="ml-2 text-muted-foreground">
                        {symptom.reported === true
                          ? "Patient reported"
                          : symptom.reported === false
                            ? "AI interpretation"
                            : "Provenance unavailable"}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No validated symptom summary is available.
                </p>
              )}
            </Panel>

            {recommendations.length > 0 && (
              <Panel title="Backend recommendations" icon={Sparkles}>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {recommendations.map((recommendation, index) => (
                    <li key={`${index}-${recommendation}`}>{recommendation}</li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel title={t("panels.severityScore", { ns: "ai" })} icon={ShieldAlert}>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-warning">
                    {riskScore === null ? "—" : riskScore}
                    <span className="text-base text-muted-foreground">/100</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {riskLevel || "Waiting for assessment"}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-mint overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${riskScore ?? 0}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-warning"
                />
              </div>
            </Panel>

            <Panel title="Request status" icon={Activity}>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 rounded-full ${isProcessing ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
                />
                {isProcessing
                  ? "Submitting text to the consultation service…"
                  : submissionError
                    ? "No validated response returned"
                    : callState === "connected"
                      ? "Ready to submit text"
                      : "Consultation not active"}
              </div>
            </Panel>

            <Panel title="Consultation" icon={Stethoscope}>
              <p className="text-sm text-muted-foreground">
                {consultationId ? `Session ${consultationId}` : "No active consultation"}
              </p>
              {callState === "connected" && !voiceInputAvailable && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Voice recognition is unavailable; use the message box instead.
                </p>
              )}
            </Panel>

            {emergencyMessage && (
              <div className="rounded-3xl border border-destructive/40 bg-destructive/5 p-5 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-destructive">Emergency Escalation</div>
                  <div className="text-xs text-muted-foreground">{emergencyMessage}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function createWorkflow() {
  return new AiDoctorWorkflow({
    startConsultation: (language) => consultationAPI.start(language),
    sendTranscript: (consultationId, text, language, history) =>
      videoAPI.sendTranscript(consultationId, text, language, history),
  });
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-card border border-border shadow-soft p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="grid place-items-center h-8 w-8 rounded-lg bg-mint text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Bubble({ who, text, mine }: { who: string; text: string; mine?: boolean }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-gradient-primary text-primary-foreground" : "bg-card border border-border"}`}
      >
        <div
          className={`text-[10px] uppercase mb-0.5 ${mine ? "text-primary-foreground/80" : "text-primary"}`}
        >
          {who}
        </div>
        {text}
      </div>
    </div>
  );
}
