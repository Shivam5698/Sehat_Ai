import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { authAPI, authStorage } from "@/services/api/client";
import { ApiError } from "@/types/aiDoctor";

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let requestPending = false;

    async function checkSession() {
      if (requestPending) return;
      if (!authStorage.getUser()) {
        setStatus("unauthenticated");
        return;
      }
      requestPending = true;
      setStatus("loading");
      try {
        const session = await authAPI.currentSession();
        if (!active) return;
        authStorage.setSession(session);
        setStatus("authenticated");
      } catch (error) {
        if (active) setStatus(error instanceof ApiError && error.status === 401
          ? "unauthenticated"
          : "error");
      } finally {
        requestPending = false;
      }
    }

    const unsubscribe = authStorage.subscribe((authenticated) => {
      if (authenticated === true && authStorage.getUser()) {
        setStatus("authenticated");
      } else if (authenticated === false) {
        setStatus("unauthenticated");
      } else {
        void checkSession();
      }
    });
    void checkSession();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [attempt]);

  useEffect(() => {
    if (status === "unauthenticated") {
      void navigate({ to: "/login", replace: true });
    }
  }, [navigate, status]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <section className="container mx-auto px-4 py-12" role="status">
        Verifying your sign-in…
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="container mx-auto px-4 py-12">
        <section className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6">
          <p role="alert">We could not verify your sign-in. Check your connection and try again.</p>
          <Button onClick={() => setAttempt((current) => current + 1)}>Try again</Button>
        </section>
      </section>
    );
  }

  return children;
}
