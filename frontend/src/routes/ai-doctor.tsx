import { createFileRoute, redirect } from "@tanstack/react-router";
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
  Brain,
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
import { authStorage, consultationAPI, videoAPI } from "@/services/api/client";

type ConversationMessage = {
  speaker: "patient" | "ai";
  text: string;
  language: string;
  timestamp: string;
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
      { title: "AI Doctor — Live Consultation | Sehat AI" },
      {
        name: "description",
        content: "Real-time AI doctor with voice, video, and instant symptom analysis.",
      },
      { property: "og:title", content: "AI Doctor — Sehat AI" },
      { property: "og:description", content: "Speak with an AI doctor in real-time." },
    ],
  }),
  beforeLoad: () => {
    if (typeof window !== "undefined" && !authStorage.isAuthenticated()) {
      throw redirect({ to: "/login" });
    }
  },
  component: AiDoctorPage,
});

function AiDoctorPage() {
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callState, setCallState] = useState<
    "idle" | "connecting" | "connected" | "ending" | "ended"
  >("idle");
  const [callError, setCallError] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const [consultationId, setConsultationId] = useState("");
  const [avatarStreamUrl, setAvatarStreamUrl] = useState("");
  const [avatarVideoUrl, setAvatarVideoUrl] = useState("");
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [riskLevel, setRiskLevel] = useState("");
  const [detectedSymptoms, setDetectedSymptoms] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const consultationIdRef = useRef("");
  const videoSessionIdRef = useRef("");
  const callActiveRef = useRef(false);
  const mutedRef = useRef(false);
  const processingRef = useRef(false);
  const { t, i18n } = useTranslation(["common", "ai"]);
  const voiceInputAvailable =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    return () => {
      callActiveRef.current = false;
      recognitionRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  useEffect(() => {
    if (!avatarVideoRef.current) return;
    const source = avatarVideoUrl || avatarStreamUrl;
    if (source) {
      avatarVideoRef.current.src = source;
      void avatarVideoRef.current.play().catch((error: unknown) => {
        console.warn("Avatar video could not autoplay", error);
      });
    } else {
      avatarVideoRef.current.removeAttribute("src");
      avatarVideoRef.current.load();
    }
  }, [avatarStreamUrl, avatarVideoUrl]);

  const processPatientMessage = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || !consultationIdRef.current || !videoSessionIdRef.current || processingRef.current)
      return;

    processingRef.current = true;
    setIsProcessing(true);
    setIsListening(false);
    const patientMessage: ConversationMessage = {
      speaker: "patient",
      text,
      language: i18n.language,
      timestamp: new Date().toISOString(),
    };
    const history = [...messagesRef.current, patientMessage];
    messagesRef.current = history;
    setMessages(history);
    setDraft("");

    try {
      const transcriptResult = await videoAPI.sendTranscript(
        consultationIdRef.current,
        text,
        i18n.language,
        history,
      );
      if (!callActiveRef.current) return;
      const assessment = transcriptResult?.validatedResponse;
      const recommendations = Array.isArray(assessment?.recommendations)
        ? assessment.recommendations.filter(
            (item: unknown): item is string => typeof item === "string" && item.trim().length > 0,
          )
        : [];
      const symptoms = Array.isArray(assessment?.symptoms)
        ? assessment.symptoms
            .map((item: unknown) => {
              if (typeof item === "string") return item;
              if (
                typeof item === "object" &&
                item !== null &&
                "name" in item &&
                typeof item.name === "string"
              )
                return item.name;
              return "";
            })
            .filter((item: string) => item.length > 0)
        : [];
      setDetectedSymptoms(symptoms);
      const responseText =
        assessment?.shouldEscalate === true && typeof assessment.emergencyMessage === "string"
          ? assessment.emergencyMessage
          : recommendations.length
            ? recommendations.join(" ")
            : symptoms.length
              ? `I've noted ${symptoms.join(", ")}. Could you tell me when these symptoms started and how they are affecting you?`
              : "Thank you for sharing that. Could you tell me when this started and how severe it feels?";
      const aiMessage: ConversationMessage = {
        speaker: "ai",
        text: responseText,
        language: i18n.language,
        timestamp: new Date().toISOString(),
      };
      messagesRef.current = [...messagesRef.current, aiMessage];
      setMessages((current) => [...current, aiMessage]);
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

      setIsSpeaking(true);
      const speechResult = await videoAPI.avatarSpeak(
        videoSessionIdRef.current,
        responseText,
        "neutral",
        i18n.language,
      );
      if (!callActiveRef.current) return;
      const speech = speechResult?.response;
      if (typeof speech?.videoUrl === "string" && speech.videoUrl)
        setAvatarVideoUrl(speech.videoUrl);
      if (typeof speech?.audioUrl === "string" && speech.audioUrl) {
        audioRef.current?.pause();
        const audio = new Audio(speech.audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          setAvatarVideoUrl("");
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          setAvatarVideoUrl("");
          setCallError("The avatar response was generated, but its audio could not be played.");
        };
        await audio.play();
      } else {
        setIsSpeaking(false);
        setCallError("The AI replied, but the avatar did not return playable audio.");
      }
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "Could not process your message.");
      setIsSpeaking(false);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      if (callActiveRef.current && !mutedRef.current) {
        window.setTimeout(() => startVoiceCapture(), 300);
      }
    }
  };

  const startVoiceCapture = () => {
    if (
      !callActiveRef.current ||
      mutedRef.current ||
      processingRef.current ||
      recognitionRef.current
    )
      return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setCallError("Voice input is not supported in this browser. You can type a message below.");
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
        setCallError(`Voice input failed: ${event.error}. You can type a message instead.`);
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
      setCallError("");
      setIsListening(true);
    } catch (error) {
      recognitionRef.current = null;
      setCallError(error instanceof Error ? error.message : "Could not start voice input.");
    }
  };

  const startCall = async () => {
    if (callState === "connecting" || callState === "connected") return;
    setCallError("");
    setCallState("connecting");
    setCameraLoading(true);
    mutedRef.current = false;
    setMuted(false);
    setCamOn(true);
    messagesRef.current = [];
    setMessages([]);
    setRiskScore(null);
    setRiskLevel("");
    setDetectedSymptoms([]);
    setAvatarStreamUrl("");
    setAvatarVideoUrl("");
    let newConsultationId = "";
    let newVideoSessionId = "";
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          mediaStreamRef.current = stream;
          setMediaStream(stream);
        } catch (mediaError) {
          setCallError(
            mediaError instanceof Error
              ? `Camera/microphone access was denied. You can still type messages: ${mediaError.message}`
              : "Camera/microphone access was denied. You can still type messages.",
          );
        }
      } else {
        setCallError("Camera and microphone are unavailable. You can still type messages.");
      }

      const consultationResult = await consultationAPI.start(i18n.language);
      newConsultationId = consultationResult?.session?.id;
      if (typeof newConsultationId !== "string" || !newConsultationId) {
        throw new Error("The consultation could not be created.");
      }
      consultationIdRef.current = newConsultationId;
      setConsultationId(newConsultationId);

      const sessionResult = await videoAPI.initializeSession(newConsultationId, "");
      newVideoSessionId = sessionResult?.sessionId;
      if (typeof newVideoSessionId !== "string" || !newVideoSessionId) {
        throw new Error("The AI avatar session could not be created.");
      }
      videoSessionIdRef.current = newVideoSessionId;
      if (typeof sessionResult.streamUrl === "string") setAvatarStreamUrl(sessionResult.streamUrl);
      await videoAPI.startStream(newVideoSessionId);
      callActiveRef.current = true;
      setCallState("connected");
      startVoiceCapture();
    } catch (error) {
      callActiveRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setMediaStream(null);
      setCameraLoading(false);
      const cleanupErrors: string[] = [];
      if (newVideoSessionId) {
        try {
          await videoAPI.endSession(newVideoSessionId);
        } catch (cleanupError) {
          cleanupErrors.push(
            cleanupError instanceof Error ? cleanupError.message : "Avatar session cleanup failed.",
          );
        }
      }
      if (newConsultationId) {
        try {
          await consultationAPI.end(newConsultationId);
        } catch (cleanupError) {
          cleanupErrors.push(
            cleanupError instanceof Error ? cleanupError.message : "Consultation cleanup failed.",
          );
        }
      }
      const message =
        error instanceof Error ? error.message : "Could not start the AI consultation.";
      setCallError(
        cleanupErrors.length ? `${message} Cleanup issue: ${cleanupErrors.join("; ")}` : message,
      );
      videoSessionIdRef.current = "";
      consultationIdRef.current = "";
      setConsultationId("");
      setCallState("idle");
    } finally {
      setCameraLoading(false);
    }
  };

  const endCall = async () => {
    if (callState !== "connected") return;
    setCallState("ending");
    callActiveRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    audioRef.current?.pause();
    setIsSpeaking(false);
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setMediaStream(null);

    const results = await Promise.allSettled([
      videoSessionIdRef.current
        ? videoAPI.endSession(videoSessionIdRef.current)
        : Promise.resolve(),
      consultationIdRef.current
        ? consultationAPI.end(consultationIdRef.current)
        : Promise.resolve(),
    ]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) =>
        result.reason instanceof Error ? result.reason.message : "A session could not be ended.",
      );
    setCallError(failures.length ? failures.join("; ") : "");
    videoSessionIdRef.current = "";
    consultationIdRef.current = "";
    setConsultationId("");
    setAvatarStreamUrl("");
    setAvatarVideoUrl("");
    setDetectedSymptoms([]);
    setCallState("ended");
    setIsListening(false);
  };

  const handleToggleMic = () => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    mediaStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    if (nextMuted) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
    } else {
      startVoiceCapture();
    }
  };

  const handleToggleCam = () => {
    setCamOn((current) => {
      const nextOn = !current;
      mediaStreamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = nextOn;
      });
      return nextOn;
    });
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
          <div className="lg:col-span-2 rounded-3xl bg-card border border-border shadow-soft overflow-hidden flex flex-col" aria-labelledby="consultation-workspace-title">
            <div className="px-5 py-3 flex flex-col gap-3 border-b border-border bg-mint">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${callState === "connected" ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
                  />
                  <span id="consultation-workspace-title" className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {callState === "connecting"
                      ? "Connecting"
                      : callState === "connected"
                        ? t("ai.liveStatus", "Live")
                        : "Not connected"}
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {t("ai.doctorLabel", "AI Doctor")}
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
                  Microphone: {!mediaStream ? "Off" : muted ? "Muted" : "Active"}
                </div>
                <div className="rounded-full bg-background/80 px-3 py-2 text-foreground border border-border">
                  Status:{" "}
                  {isSpeaking
                    ? "AI speaking"
                    : isProcessing
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
              <video
                ref={avatarVideoRef}
                autoPlay
                muted
                playsInline
                loop
                poster={aiDoctor}
                className="absolute inset-0 h-full w-full object-cover"
                aria-label="AI doctor avatar"
              />
              {!avatarStreamUrl && !avatarVideoUrl && (
                <div className="absolute inset-0 grid place-items-end p-4">
                  <span className="rounded-full bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
                    {callState === "connected"
                      ? "Avatar stream is loading…"
                      : "Start a consultation to connect your AI doctor"}
                  </span>
                </div>
              )}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-end gap-1 h-12">
                {Array.from({ length: 24 }).map((_, i) => (
                  <motion.span
                    key={i}
                    animate={{
                      height: isSpeaking
                        ? [`${20 + (i % 5) * 8}%`, `${60 + (i % 4) * 10}%`, `${30 + (i % 6) * 6}%`]
                        : "12%",
                    }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.05 }}
                    className="w-1.5 rounded-full bg-primary-foreground/90"
                  />
                ))}
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
                disabled={callState !== "connected"}
                variant={muted ? "destructive" : "secondary"}
                size="icon"
                className="rounded-full h-12 w-12"
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              >
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
              <Button
                onClick={handleToggleCam}
                disabled={callState !== "connected"}
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
                  disabled={callState === "connecting"}
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
                      : "Start consultation"}
                </Button>
              )}
            </div>
            {callError && (
              <div
                role="alert"
                className="mx-5 mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                {callError}
              </div>
            )}

            <div className="p-5 border-t border-border bg-section">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" /> {t("ai.liveTranscript")}
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto" aria-live="polite" aria-label="Consultation transcript">
                {messages.length ? (
                  messages.map((message, index) => (
                    <Bubble
                      key={`${message.timestamp}-${index}`}
                      who={message.speaker === "ai" ? t("who.aiDoctor") : t("who.you")}
                      text={message.text}
                      mine={message.speaker === "patient"}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {callState === "connected"
                      ? "Your conversation will appear here."
                      : "Start a consultation to begin talking with the AI doctor."}
                  </p>
                )}
              </div>
              <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={callState !== "connected" || isProcessing}
                  aria-label="Message the AI doctor"
                  placeholder="Type a message if you prefer…"
                  className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={callState !== "connected" || isProcessing || !draft.trim()}
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
            <Panel title={t("ai.panels.detectedSymptoms")} icon={Activity}>
              {detectedSymptoms.length ? (
                <div className="flex flex-wrap gap-2">
                  {detectedSymptoms.map((symptom) => (
                    <span
                      key={symptom}
                      className="rounded-full bg-mint text-primary text-xs font-medium px-3 py-1.5 border border-border"
                    >
                      {symptom}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Symptoms will be summarized as you talk with the AI doctor.
                </p>
              )}
            </Panel>

            <Panel title={t("ai.panels.severityScore")} icon={ShieldAlert}>
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

            <Panel title={t("ai.panels.activeAgents")} icon={Brain}>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 rounded-full ${isProcessing ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
                />
                {isProcessing
                  ? "Analyzing your message…"
                  : callState === "connected"
                    ? "Ready for your message"
                    : "Not active"}
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

            <div className="rounded-3xl border border-destructive/40 bg-destructive/5 p-5 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <div className="text-sm font-semibold text-destructive">Emergency Escalation</div>
                <div className="text-xs text-muted-foreground">
                  If you may be experiencing an emergency, contact local emergency services now.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
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
