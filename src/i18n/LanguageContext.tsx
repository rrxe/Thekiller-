import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "./en";
import ar from "./ar";

export type Lang = "en" | "ar";

const dictionaries: Record<Lang, any> = { en, ar };

const STORAGE_KEY = "stormy.lang.v1";

function getPath(obj: any, path: string) {
  return path
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function detectDefaultLang(): Lang {
  return "en";
}

type LanguageContextValue = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectDefaultLang());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {}

    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", lang);
      document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    }
  }, [lang]);

  const t = useMemo(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[lang] ?? dictionaries.en;
      let value = getPath(dict, key);

      if (value === undefined) value = getPath(dictionaries.en, key);
      if (value === undefined) return key;
      if (typeof value !== "string") return String(value);
      if (!vars) return value;

      return Object.keys(vars).reduce(
        (acc, k) => acc.split(`{{${k}}}`).join(String(vars[k])),
        value
      );
    };
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang: setLangState,
      t,
    }),
    [lang, t]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}

