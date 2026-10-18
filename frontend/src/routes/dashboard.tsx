import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (!authStorage.getUser()) {
      setUser(null);
      setConsultations([]);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError("");

    Promise.all([authAPI.currentSession(), consultationAPI.list()])
      .then(([session, consultationList]) => {
        if (!consultationList.ok || !Array.isArray(consultationList.sessions)) {
          throw new Error("Invalid consultation list response");
        }
        if (!active) return;
        setUser(session.user);
        setConsultations(consultationList.sessions);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          setUser(null);
          setConsultations([]);
          setError("");
        } else {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "Dashboard data is unavailable right now.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <main className="bg-section min-h-[calc(100vh-4rem)] py-10">
      <div className="container mx-auto max-w-4xl px-4">
        <section className="rounded-3xl border border-border bg-card p-8 shadow-soft">
            <h1 className="font-display text-2xl font-bold">Your dashboard</h1>
            {loading ? (
              <p className="mt-6 text-sm text-muted-foreground" role="status">
                Loading your dashboard…
              </p>
            ) : error ? (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-destructive" role="alert">{error}</p>
                <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                  Try again
                </Button>
              </div>
            ) : (
              <>
                {user ? (
                  <section className="mt-6 rounded-2xl border border-border p-5">
                    <h2 className="font-semibold">Account</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {user.name || user.email}
                    </p>
                    {user.name ? (
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    ) : null}
                  </section>
                ) : null}

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
                      {user
                        ? "You do not have any consultations yet."
                        : "Sign in to view your private consultation history."}
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
