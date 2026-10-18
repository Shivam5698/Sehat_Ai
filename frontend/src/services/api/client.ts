// API Client Configuration
import {
  ApiError,
  parseTranscriptResponse,
  type AIDoctorTranscriptRequest,
  type TranscriptResponse,
} from "@/types/aiDoctor";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const AUTH_CHANGE_EVENT = "sehat-ai-auth-change";
let currentSessionRequest: Promise<CurrentSessionResponse> | null = null;
let currentSessionRequestGeneration = 0;

function invalidateCurrentSessionRequest(): void {
  currentSessionRequestGeneration += 1;
  currentSessionRequest = null;
}

export type AuthUser = { id: string; email: string; name: string | null };

type AuthResponse = { ok: true; user: AuthUser };

export type CurrentSessionResponse = { ok: true; user: AuthUser };

export type ConsultationSummary = {
  id: string;
  status: string;
  language: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

type ConsultationListResponse = { ok: true; sessions: ConsultationSummary[] };

export type GeneratedReport = {
  id: string;
  content: string;
  createdAt: string;
};

type ConsultationStartResponse = {
  session: { id: string };
};

type VideoSessionInitResponse = {
  sessionId: string;
  streamUrl?: string;
};

type AvatarSpeechResponse = {
  response?: { videoUrl?: string; audioUrl?: string };
};

export const authStorage = {
  notifyChange(authenticated: boolean) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<boolean>(AUTH_CHANGE_EVENT, { detail: authenticated }));
    }
  },
  setSession(session: { user: AuthUser }) {
    if (typeof window === "undefined") return;
    if (
      !session.user ||
      typeof session.user.id !== "string" ||
      typeof session.user.email !== "string" ||
      (session.user.name !== null && typeof session.user.name !== "string")
    ) {
      throw new Error("The authentication service returned an invalid user.");
    }
    invalidateCurrentSessionRequest();
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("refreshToken");
    window.localStorage.setItem("user", JSON.stringify(session.user));
    this.notifyChange(true);
  },
  getUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const serializedUser = window.localStorage.getItem("user");
    if (!serializedUser) return null;
    try {
      const user: unknown = JSON.parse(serializedUser);
      if (
        typeof user === "object" &&
        user !== null &&
        !Array.isArray(user) &&
        "id" in user &&
        typeof user.id === "string" &&
        "email" in user &&
        typeof user.email === "string" &&
        "name" in user &&
        (typeof user.name === "string" || user.name === null)
      ) {
        return { id: user.id, email: user.email, name: user.name };
      }
      return null;
    } catch {
      return null;
    }
  },
  clearSession() {
    if (typeof window === "undefined") return;
    const changed = Boolean(
      window.localStorage.getItem("token") ||
        window.localStorage.getItem("refreshToken") ||
        window.localStorage.getItem("user"),
    );
    if (changed) invalidateCurrentSessionRequest();
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("refreshToken");
    window.localStorage.removeItem("user");
    if (changed) this.notifyChange(false);
  },
  subscribe(listener: (authenticated: boolean | null) => void) {
    if (typeof window === "undefined") return () => {};
    const onAuthChange = (event: Event) => {
      listener((event as CustomEvent<boolean>).detail);
    };
    const onStorage = () => listener(null);
    window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange);
      window.removeEventListener("storage", onStorage);
    };
  },
};

if (typeof window !== "undefined") {
  window.localStorage.removeItem("token");
  window.localStorage.removeItem("refreshToken");
}

export const apiClient = {
  baseURL: API_BASE_URL,

  async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
    retryAfterRefresh = true,
  ): Promise<T> {
    const sessionGeneration = currentSessionRequestGeneration;
    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      credentials: "include",
      headers,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = new ApiError(response.status, payload);
      if (response.status === 401 && retryAfterRefresh && shouldRefresh(endpoint)) {
        const refreshed = await refreshAccessToken(sessionGeneration);
        if (refreshed) return this.request<T>(endpoint, options, false);
        if (
          sessionGeneration !== currentSessionRequestGeneration &&
          authStorage.getUser() !== null
        ) {
          return this.request<T>(endpoint, options, false);
        }
        authStorage.clearSession();
      }
      throw error;
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

function shouldRefresh(endpoint: string): boolean {
  return ![
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/refresh",
  ].includes(endpoint);
}

async function refreshAccessToken(sessionGeneration: number): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    if (response.status === 401) {
      if (sessionGeneration === currentSessionRequestGeneration) authStorage.clearSession();
      return false;
    }
    throw new ApiError(response.status, payload);
  }
  if (typeof payload !== "object" || payload === null || !("ok" in payload) || payload.ok !== true) {
    throw new Error("The authentication service returned an invalid refresh response.");
  }
  return true;
}

export const authAPI = {
  signup(payload: { email: string; password: string; name?: string }) {
    return apiClient.post<AuthResponse>("/api/auth/signup", payload);
  },
  login(payload: { email: string; password: string }) {
    return apiClient.post<AuthResponse>("/api/auth/login", payload);
  },
  currentSession() {
    if (!currentSessionRequest) {
      const generation = currentSessionRequestGeneration;
      const request = apiClient
        .request<unknown>("/api/auth/session", {
          method: "GET",
          cache: "no-store",
        })
        .then((payload) => {
          if (
            typeof payload !== "object" ||
            payload === null ||
            !("ok" in payload) ||
            payload.ok !== true ||
            !("user" in payload) ||
            typeof payload.user !== "object" ||
            payload.user === null ||
            !("id" in payload.user) ||
            typeof payload.user.id !== "string" ||
            !("email" in payload.user) ||
            typeof payload.user.email !== "string" ||
            !("name" in payload.user) ||
            (payload.user.name !== null && typeof payload.user.name !== "string")
          ) {
            throw new Error("The authentication service returned an invalid session response.");
          }
          return payload as CurrentSessionResponse;
        })
        .finally(() => {
          if (
            generation === currentSessionRequestGeneration &&
            currentSessionRequest === request
          ) {
            currentSessionRequest = null;
          }
        });
      currentSessionRequest = request;
    }
    return currentSessionRequest;
  },
  logout() {
    return apiClient.post<{ ok: true }>("/api/auth/logout", {});
  },
  async hasValidSession(): Promise<boolean> {
    if (!authStorage.getUser()) return false;
    const sessionGeneration = currentSessionRequestGeneration;
    try {
      await this.currentSession();
      return true;
    } catch (error) {
      if (sessionGeneration !== currentSessionRequestGeneration) {
        return this.hasValidSession();
      }
      if (error instanceof ApiError && error.status === 401) return false;
      throw error;
    }
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
    return apiClient.get<ConsultationListResponse>("/api/consultation");
  },

  get(id: string) {
    return apiClient.get(`/api/consultation/${id}`);
  },
};

export const reportAPI = {
  generate(consultationId: string) {
    return apiClient.post<{ ok: true; report: GeneratedReport }>("/api/reports/generate", {
      consultationId,
    });
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

  async sendTranscript(
    consultationId: string,
    transcript: string,
    language?: string,
    history?: AIDoctorTranscriptRequest["history"],
  ): Promise<TranscriptResponse> {
    const request: AIDoctorTranscriptRequest = {
      consultationId,
      transcript,
      language,
      history,
    };
    const payload = await apiClient.post<unknown>("/api/video/transcript", request);
    return parseTranscriptResponse(payload);
  },

  listAvatars() {
    return apiClient.get("/api/video/avatars");
  },
};
