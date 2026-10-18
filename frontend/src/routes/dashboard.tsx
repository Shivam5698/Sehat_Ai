import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import {
  authAPI,
  authStorage,
  consultationAPI,
  type AuthUser,
  type ConsultationSummary,
} from "@/services/api/client";
import { ApiError } from "@/types/aiDoctor";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | Sehat AI" },
      {
        name: "description",
        content: "Consultation dashboard availability and status.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return <DashboardContent />;
}

function DashboardContent() {
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authenticated" | "unauthenticated" | "error"
  >("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const activeUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let authChangeVersion = 0;
    let requestedUserId: string | null = null;
    setLoading(true);
    setError("");

    const loadConsultations = (userId: string) => {
      if (requestedUserId === userId) return;
      requestedUserId = userId;
      void consultationAPI
        .list()
        .then((consultationList) => {
          if (!consultationList.ok || !Array.isArray(consultationList.sessions)) {
            throw new Error("Invalid consultation list response");
          }
          if (!active || activeUserId.current !== userId) return;
          setConsultations(consultationList.sessions);
        })
        .catch((requestError: unknown) => {
          if (!active || activeUserId.current !== userId) return;
          requestedUserId = null;
          if (requestError instanceof ApiError && requestError.status === 401) {
            setAuthStatus("unauthenticated");
            setUser(null);
            setConsultations([]);
            setError("");
            return;
          }
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "Dashboard data is unavailable right now.",
          );
        })
        .finally(() => {
          if (active && activeUserId.current === userId) setLoading(false);
        });
    };

    const onAuthenticated = (authenticatedUser: AuthUser) => {
      const userChanged = activeUserId.current !== authenticatedUser.id;
      const needsConsultationLoad = requestedUserId !== authenticatedUser.id;
      activeUserId.current = authenticatedUser.id;
      setUser(authenticatedUser);
      setAuthStatus("authenticated");
      if (needsConsultationLoad) {
        setError("");
        setLoading(true);
        if (userChanged) setConsultations([]);
        loadConsultations(authenticatedUser.id);
      }
    };

    const onUnauthenticated = () => {
      activeUserId.current = null;
      requestedUserId = null;
      setAuthStatus("unauthenticated");
      setUser(null);
      setConsultations([]);
      setError("");
      setLoading(false);
    };

    const unsubscribe = authStorage.subscribe((authenticated) => {
      authChangeVersion += 1;
      if (authenticated === true) {
        const storedUser = authStorage.getUser();
        if (storedUser) onAuthenticated(storedUser);
      } else if (authenticated === false) {
        onUnauthenticated();
      } else {
        void authAPI
          .currentSession()
          .then((session) => {
            if (active) onAuthenticated(session.user);
          })
          .catch((requestError: unknown) => {
            if (!active) return;
            if (requestError instanceof ApiError && requestError.status === 401) {
              onUnauthenticated();
              return;
            }
            setAuthStatus("error");
            setError(
              requestError instanceof ApiError
                ? requestError.message
                : "Dashboard data is unavailable right now.",
            );
            setLoading(false);
          });
      }
    });

    const checkedAuthVersion = authChangeVersion;
    authAPI
      .currentSession()
      .then((session) => {
        if (!active || checkedAuthVersion !== authChangeVersion) return;
        onAuthenticated(session.user);
      })
      .catch((requestError: unknown) => {
        if (!active || checkedAuthVersion !== authChangeVersion) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          setAuthStatus("unauthenticated");
          setUser(null);
          setConsultations([]);
          setError("");
          return;
        }
        setAuthStatus("error");
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Dashboard data is unavailable right now.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [attempt]);

  return (
    <main className="bg-section min-h-[calc(100vh-4rem)] py-10">
      <div className="container mx-auto max-w-4xl px-4">
        <section className="rounded-3xl border border-border bg-card p-8 shadow-soft">
            <h1 className="font-display text-2xl font-bold">Your dashboard</h1>
            {authStatus === "loading" || loading ? (
              <p className="mt-6 text-sm text-muted-foreground" role="status">
                Loading your dashboard…
              </p>
            ) : authStatus === "unauthenticated" ? (
              <div className="mt-6 space-y-6">
                <p className="text-sm text-muted-foreground">
                  Sign in to view your account details and private consultation history.
                </p>
                <Link to="/login">
                  <Button variant="outline">Sign in</Button>
                </Link>
                <section>
                  <h2 className="font-display text-xl font-semibold">Consultation history</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Private consultation history is available after you sign in.
                  </p>
                </section>
              </div>
            ) : error ? (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-destructive" role="alert">{error}</p>
                <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                  Try again
                </Button>
              </div>
            ) : (
              <>
                <section className="mt-6 rounded-2xl border border-border p-5">
                  <h2 className="font-semibold">Account</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {user?.name || user?.email}
                  </p>
                  {user?.name ? (
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  ) : null}
                </section>

                <section className="mt-8">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-xl font-semibold">Consultation history</h2>
                    <p className="text-sm text-muted-foreground">
                      {consultations.length} {consultations.length === 1 ? "consultation" : "consultations"}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Risk metrics, appointments, and agent activity are not provided by the
                    currently available dashboard APIs.
                  </p>
                  {consultations.length === 0 ? (
                    <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground" role="status">
                      You do not have any consultations yet.
                    </p>
                  ) : (
                    <ul className="mt-5 divide-y divide-border">
                      {consultations.map((consultation) => (
                        <li key={consultation.id} className="flex flex-wrap justify-between gap-2 py-4">
                          <div>
                            <p className="font-medium">Consultation</p>
                            <p className="text-sm text-muted-foreground">
                              {consultation.status} · {consultation.language}
                            </p>
                          </div>
                          <time
                            className="text-sm text-muted-foreground"
                            dateTime={consultation.startedAt || consultation.createdAt}
                          >
                            {formatDate(consultation.startedAt || consultation.createdAt)}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
        </section>
      </div>
    </main>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}
