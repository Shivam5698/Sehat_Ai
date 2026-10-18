import i18n, { type Resource, type ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next";

// Load all translation json files under /translations using Vite's glob
const modules = import.meta.glob<{ default: ResourceLanguage }>("../translations/*/*.json", {
  eager: true,
});

const resources: Resource = {};
Object.entries(modules).forEach(([path, mod]) => {
  // path example: ../translations/en/common.json
  const parts = path.split("/");
  const lang = parts[parts.length - 2];
  const nsFile = parts[parts.length - 1];
  const ns = nsFile.replace(/\.json$/, "");
  resources[lang] = resources[lang] || {};
  resources[lang][ns] = mod.default;
});

// ensure supported languages include all translation folders and requested locales
const supportedLngs = ["en", "hi", "ur", "bn", "ta", "te", "mr", "gu", "pa", "ar", "ml", "kn"];

i18n.use(initReactI18next).init({
  resources,
  fallbackLng: "en",
  supportedLngs,
  ns: ["common", "home", "dashboard", "consult", "reports", "about", "contact", "auth", "ai"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

// Basic resource key consistency check (dev-time only) — log missing keys compared to English
try {
  const en = resources["en"] || {};
  Object.keys(resources).forEach((lng) => {
    if (lng === "en") return;
    const missing: string[] = [];
    Object.keys(en).forEach((ns) => {
      const enResource = en[ns];
      const otherResource = resources[lng]?.[ns];
      const enNs = isTranslationObject(enResource) ? enResource : {};
      const otherNs = isTranslationObject(otherResource) ? otherResource : {};
      Object.keys(enNs).forEach((key) => {
        if (!(key in otherNs)) missing.push(`${ns}.${key}`);
      });
    });
    if (missing.length) console.warn(`i18n: Missing keys for '${lng}':`, missing.slice(0, 20));
  });
} catch (e) {
  // ignore in production
}

// Keep document direction updated on language change
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.dir = lng === "ur" ? "rtl" : "ltr";
    document.documentElement.lang = lng;
    try {
      localStorage.setItem("sehat:lang", lng);
    } catch {
      console.warn("Unable to persist selected language.");
    }
  }
});

function isTranslationObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default i18n;
