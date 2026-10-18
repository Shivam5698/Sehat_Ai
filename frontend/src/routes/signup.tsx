import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { Stethoscope } from "lucide-react";
import { FormEvent, useState } from "react";
import team from "@/assets/team-doctors.jpg";
import { authAPI, authStorage } from "@/services/api/client";
import { ApiError } from "@/types/aiDoctor";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up — Sehat AI" },
      { name: "description", content: "Create your Sehat AI account and meet your AI doctor." },
      { property: "og:title", content: "Sign Up — Sehat AI" },
      { property: "og:description", content: "Create a Sehat AI account." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      if (await authAPI.hasValidSession()) throw redirect({ to: "/ai-doctor" });
    } catch (error) {
      if (!(error instanceof ApiError) && !(error instanceof TypeError)) throw error;
    }
  },
  component: SignupPage,
});

function SignupPage() {
  const { t } = useTranslation(["common", "auth"]);
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await authAPI.signup({
        email: form.email,
        password: form.password,
        name: `${form.firstName} ${form.lastName}`.trim(),
      });
      authStorage.setSession({ user: result.user });
      navigate({ to: "/ai-doctor" });
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Cannot reach the Sehat AI backend. Check that it is running and try again."
          : err instanceof Error
            ? err.message
            : "Unable to create account",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img src={team} alt="Healthcare team" loading="lazy" width={1280} height={800} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-bl from-primary/40 to-transparent" />
      </div>
      <div className="flex items-center justify-center p-8 bg-background">
        <form className="w-full max-w-md space-y-5" onSubmit={onSubmit}>
          <Link to="/" className="flex items-center gap-2">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-primary text-primary-foreground"><Stethoscope className="h-5 w-5" /></span>
            <span className="font-display font-bold text-lg">Sehat<span className="text-primary">Agent</span></span>
          </Link>
          <div>
            <h1 className="font-display text-3xl font-bold">{t('auth.createAccountTitle')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('auth.createAccountDesc')}</p>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="first">{t('form.firstName', { ns: 'auth' })}</Label>
                <Input id="first" value={form.firstName} onChange={(e) => updateField('firstName', e.target.value)} placeholder={t('form.firstNamePlaceholder', { ns: 'auth' })} className="mt-1.5 rounded-xl" required />
              </div>
              <div>
                <Label htmlFor="last">{t('form.lastName', { ns: 'auth' })}</Label>
                <Input id="last" value={form.lastName} onChange={(e) => updateField('lastName', e.target.value)} placeholder={t('form.lastNamePlaceholder', { ns: 'auth' })} className="mt-1.5 rounded-xl" required />
              </div>
            </div>
            <div>
              <Label htmlFor="email">{t('form.email', { ns: 'auth' })}</Label>
              <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} placeholder={t('form.emailPlaceholder', { ns: 'auth' })} className="mt-1.5 rounded-xl" required />
            </div>
            <div>
              <Label htmlFor="password">{t('form.password', { ns: 'auth' })}</Label>
              <Input id="password" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(e) => updateField('password', e.target.value)} placeholder={t('form.passwordPlaceholder', { ns: 'auth' })} className="mt-1.5 rounded-xl" required />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={submitting} className="w-full rounded-full bg-gradient-primary text-primary-foreground shadow-medical h-11">{submitting ? 'Creating account...' : t('buttons.createAccount')}</Button>
          <p className="text-sm text-muted-foreground text-center">
            {t('alreadyHaveAccount', { ns: 'auth' })} <Link to="/login" className="text-primary font-semibold">{t('signIn', { ns: 'auth' })}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
