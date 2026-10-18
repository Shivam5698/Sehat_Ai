import { useEffect, useRef, useState } from "react";
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
  const redirecting = useRef(false);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const session = await authAPI.currentSession();
        if (!active) return;
        const storedUser = authStorage.getUser();
        if (
          storedUser?.id !== session.user.id ||
          storedUser.email !== session.user.email ||
          storedUser.name !== session.user.name
        ) {
          authStorage.setSession(session);
        }
        setStatus("authenticated");
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setStatus("unauthenticated");
          if (!redirecting.current) {
            redirecting.current = true;
            void navigate({ to: "/login" });
          }
          return;
        }
        setStatus("error");
      }
    }

    const unsubscribe = authStorage.subscribe((authenticated) => {
      if (authenticated === true && authStorage.getUser()) {
        redirecting.current = false;
        setStatus("authenticated");
      } else if (authenticated === false) {
        setStatus("unauthenticated");
        if (!redirecting.current) {
          redirecting.current = true;
          void navigate({ to: "/login" });
        }
      }
    });
    void checkSession();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [attempt, navigate]);

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
          <p role="alert">
            We could not verify your sign-in because the backend is unavailable. Check the backend
            connection and try again.
          </p>
          <Button onClick={() => setAttempt((current) => current + 1)}>Try again</Button>
        </section>
      </section>
    );
  }

  return children;
}
