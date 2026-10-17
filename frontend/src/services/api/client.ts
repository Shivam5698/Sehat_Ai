// API Client Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const getStoredToken = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem("token");

type AuthResponse = {
  accessToken: string;
  refreshToken?: string;
  user?: Record<string, unknown>;
};

type ConsultationStartResponse = {
  session: { id: string };
};

type VideoSessionInitResponse = {
  sessionId: string;
  streamUrl?: string;
};

type TranscriptResponse = {
  validatedResponse?: {
    recommendations?: unknown;
    symptoms?: unknown;
    riskAssessment?: { riskScore?: number; level?: string };
    shouldEscalate?: boolean;
    emergencyMessage?: string;
  };
};

type AvatarSpeechResponse = {
  response?: { videoUrl?: string; audioUrl?: string };
};

export const authStorage = {
  setSession(session: {
    accessToken: string;
    refreshToken?: string;
    user?: Record<string, unknown>;
  }) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("token", session.accessToken);
    if (session.refreshToken) window.localStorage.setItem("refreshToken", session.refreshToken);
    if (session.user) window.localStorage.setItem("user", JSON.stringify(session.user));
  },
  clearSession() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("refreshToken");
    window.localStorage.removeItem("user");
  },
  isAuthenticated() {
    return typeof window !== "undefined" && Boolean(window.localStorage.getItem("token"));
  },
};

export const apiClient = {
  baseURL: API_BASE_URL,

  async request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = getStoredToken();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : `API Error: ${response.status}`;
      throw new Error(message);
    }

    return payload as T;
  },

  get<T = unknown>(endpoint: string) {
    return this.request<T>(endpoint, { method: "GET" });
  },

  post<T = unknown>(endpoint: string, data: unknown) {
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  put<T = unknown>(endpoint: string, data: unknown) {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete(endpoint: string) {
    return this.request(endpoint, { method: "DELETE" });
  },
};

export const authAPI = {
  signup(payload: { email: string; password: string; name?: string }) {
    return apiClient.post<AuthResponse>("/api/auth/signup", payload);
  },
  login(payload: { email: string; password: string }) {
    return apiClient.post<AuthResponse>("/api/auth/login", payload);
  },
};

// Consultation API
export const consultationAPI = {
  start(language: string = "en") {
    return apiClient.post<ConsultationStartResponse>("/api/consultation/start", { language });
  },

  end(consultationId: string) {
    return apiClient.post("/api/consultation/end", { consultationId });
  },

  list() {
    return apiClient.get("/api/consultation");
  },

  get(id: string) {
    return apiClient.get(`/api/consultation/${id}`);
  },
};

// Video API
export const videoAPI = {
  initializeSession(consultationId: string, avatarId: string) {
    return apiClient.post<VideoSessionInitResponse>("/api/video/session/init", {
      consultationId,
      avatarId,
    });
  },

  startStream(sessionId: string) {
    return apiClient.post("/api/video/session/start", { sessionId });
  },

  endSession(sessionId: string) {
    return apiClient.post("/api/video/session/end", { sessionId });
  },

  getStatus(sessionId: string) {
    return apiClient.get(`/api/video/session/${sessionId}/status`);
  },

  pauseSession(sessionId: string) {
    return apiClient.post("/api/video/session/pause", { sessionId });
  },

  resumeSession(sessionId: string) {
    return apiClient.post("/api/video/session/resume", { sessionId });
  },

  avatarSpeak(
    sessionId: string,
    text: string,
    emotion: string = "neutral",
    language: string = "en",
  ) {
    return apiClient.post<AvatarSpeechResponse>("/api/video/avatar/speak", {
      sessionId,
      text,
      emotion,
      language,
    });
  },

  sendTranscript(
    consultationId: string,
    transcript: string,
    language: string,
    history: Array<{
      speaker: "patient" | "ai";
      text: string;
      language: string;
      timestamp: string;
    }>,
  ) {
    return apiClient.post<TranscriptResponse>("/api/video/transcript", {
      consultationId,
      transcript,
      language,
      history,
    });
  },

  listAvatars() {
    return apiClient.get("/api/video/avatars");
  },
};
