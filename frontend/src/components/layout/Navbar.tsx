import { Link } from "@tanstack/react-router";
import { Stethoscope, Menu, Globe, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/types/aiDoctor";
import { authAPI, authStorage, type AuthUser } from "@/services/api/client";

export function Navbar() {
  const { t, i18n } = useTranslation(["common"]);
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authenticated" | "unauthenticated" | "error"
  >("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [authError, setAuthError] = useState("");

  const lang = (i18n.language || 'en') as string;
  const userLabel =
    typeof user?.name === "string" && user.name
      ? user.name
      : typeof user?.email === "string"
        ? user.email
        : "";

  useEffect(() => {
    let active = true;
    let validationAttempt = 0;
    const syncStoredSession = async () => {
      if (!authStorage.getUser()) {
        setUser(null);
        setAuthStatus("unauthenticated");
        setAuthError("");
        return;
      }
      const currentAttempt = ++validationAttempt;
      setAuthStatus("loading");
      try {
        const session = await authAPI.currentSession();
        if (!active || currentAttempt !== validationAttempt) return;
        setUser(session.user);
        setAuthStatus("authenticated");
        setAuthError("");
      } catch (error: unknown) {
        if (!active || currentAttempt !== validationAttempt) return;
        if (error instanceof ApiError && error.status === 401) {
          authStorage.clearSession();
          setUser(null);
          setAuthStatus("unauthenticated");
        } else {
          setAuthStatus("error");
          setAuthError("Unable to verify your sign-in status.");
        }
      }
    };
    const unsubscribe = authStorage.subscribe((authenticated) => {
      const storedUser = authStorage.getUser();
      if (authenticated === true && storedUser) {
        setUser(storedUser);
        setAuthStatus("authenticated");
        setAuthError("");
      } else if (authenticated === false) {
        validationAttempt += 1;
        setUser(null);
        setAuthStatus("unauthenticated");
        setAuthError("");
      } else if (storedUser) {
        void syncStoredSession();
      } else {
        validationAttempt += 1;
        setUser(null);
        setAuthStatus("unauthenticated");
        setAuthError("");
      }
    });
    if (authStorage.getUser()) void syncStoredSession();
    else setAuthStatus("unauthenticated");
    return () => {
      active = false;
      validationAttempt += 1;
      unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setAuthError("");
    try {
      await authAPI.logout();
      authStorage.clearSession();
      setUser(null);
      setAuthStatus("unauthenticated");
      setMobileMenuOpen(false);
      await navigate({ to: "/login" });
    } catch {
      if (!authStorage.getUser()) {
        setUser(null);
        setAuthStatus("unauthenticated");
        setMobileMenuOpen(false);
        await navigate({ to: "/login" });
      } else {
        setAuthError("Unable to confirm sign out. Check your connection and try again.");
      }
    } finally {
      setSigningOut(false);
    }
  }

  const links = [
    { to: "/", label: t('nav.home') },
    { to: "/ai-doctor", label: t('nav.aiDoctor') },
    { to: "/consult", label: t('nav.consult') },
    { to: "/reports", label: t('nav.reports') },
    { to: "/dashboard", label: t('nav.dashboard') },
    { to: "/about", label: t('nav.about') },
    { to: "/contact", label: t('nav.contact') },
  ] as const;

  const langLabel: Record<string, string> = { en: "EN", hi: "हि", ur: "اُر", bn: "বাংলা", ta: "தமிழ்", te: "తెలుగు" };

  return (
    <header className="sticky top-0 z-50 w-full bg-background/90 backdrop-blur border-b border-border">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-primary text-primary-foreground shadow-medical">
            <Stethoscope className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-display font-bold text-lg tracking-tight">
            Sehat<span className="text-primary">Agent</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary rounded-full transition-colors"
              activeProps={{ className: "px-3 py-2 text-sm font-medium text-primary bg-mint rounded-full" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="rounded-full gap-1.5">
                <Globe className="h-4 w-4" />
                {langLabel[lang]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => i18n.changeLanguage('en')}>English</DropdownMenuItem>
              <DropdownMenuItem onClick={() => i18n.changeLanguage('hi')}>हिन्दी</DropdownMenuItem>
              <DropdownMenuItem onClick={() => i18n.changeLanguage('ur')}>اردو</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {authStatus === "authenticated" ? (
            <>
              <span className="max-w-40 truncate text-sm text-muted-foreground">
                {userLabel}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </>
          ) : authStatus === "unauthenticated" ? (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" className="rounded-full">{t('nav.login')}</Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="rounded-full bg-gradient-primary text-primary-foreground shadow-medical hover:opacity-90">
                  {t('nav.signup')}
                </Button>
              </Link>
            </>
          ) : null}
          {authError ? (
            <p className="max-w-56 text-xs text-destructive" role="alert">
              {authError}
            </p>
          ) : null}
        </div>

        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Open mobile menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader className="sr-only">
              <SheetTitle>Mobile navigation</SheetTitle>
              <SheetDescription>Navigation links for Sehat AI.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-2 mt-8">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 text-sm font-medium text-foreground hover:text-primary rounded-xl hover:bg-mint"
                >
                  {l.label}
                </Link>
              ))}
              <div className="border-t border-border my-3" />
              {authStatus === "authenticated" ? (
                <>
                  {userLabel ? (
                    <p className="px-3 text-sm text-muted-foreground">{userLabel}</p>
                  ) : null}
                  <Button
                    variant="outline"
                    className="w-full rounded-full"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </Button>
                </>
              ) : authStatus === "unauthenticated" ? (
                <>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full rounded-full">{t('nav.login')}</Button>
                  </Link>
                  <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full rounded-full bg-gradient-primary text-primary-foreground">{t('nav.signup')}</Button>
                  </Link>
                </>
              ) : null}
              {authError ? <p className="text-sm text-destructive" role="alert">{authError}</p> : null}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
