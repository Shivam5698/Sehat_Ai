import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { Stethoscope } from "lucide-react";
import { FormEvent, useState } from "react";
import teleImage from "@/assets/telemedicine.jpg";
import { authAPI, authStorage } from "@/services/api/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — Sehat AI" },
      { name: "description", content: "Access your Sehat AI account." },
      { property: "og:title", content: "Login — Sehat AI" },
      { property: "og:description", content: "Sign in to your Sehat AI account." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window !== "undefined" && (await authAPI.hasValidSession())) {
      throw redirect({ to: "/ai-doctor" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation(["common", "auth"]);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await authAPI.login({ email, password });
      authStorage.setSession({ user: result.user });
      navigate({ to: "/ai-doctor" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8 bg-background">
        <form className="w-full max-w-md space-y-5" onSubmit={onSubmit}>
          <Link to="/" className="flex items-center gap-2">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-primary text-primary-foreground"><Stethoscope className="h-5 w-5" /></span>
            <span className="font-display font-bold text-lg">Sehat<span className="text-primary">Agent</span></span>
          </Link>
          <div>
            <h1 className="font-display text-3xl font-bold">{t('auth.welcomeBack')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('auth.signInDesc')}</p>
          </div>
          <div className="space-y-3">
            <div>
              <Label htmlFor="email">{t('form.email', { ns: 'auth' })}</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('form.emailPlaceholder', { ns: 'auth' })} className="mt-1.5 rounded-xl" required />
            </div>
            <div>
              <Label htmlFor="password">{t('form.password', { ns: 'auth' })}</Label>
              <Input id="password" type="password" autoComplete="current-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('form.passwordPlaceholder', { ns: 'auth' })} className="mt-1.5 rounded-xl" required />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting} className="w-full rounded-full bg-gradient-primary text-primary-foreground shadow-medical h-11">{submitting ? t('buttons.loading') || 'Signing in...' : t('buttons.signIn')}</Button>
          <p className="text-sm text-muted-foreground text-center">
            {t('newHere', { ns: 'auth' })} <Link to="/signup" className="text-primary font-semibold">{t('createAccount', { ns: 'auth' })}</Link>
          </p>
        </form>
      </div>
      <div className="hidden lg:block relative">
        <img src={teleImage} alt="Healthcare" loading="lazy" width={1280} height={960} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/40 to-transparent" />
      </div>
    </div>
  );
}
