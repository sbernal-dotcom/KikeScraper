"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  CategoriaPropiedad,
  Condicion,
  EstadoAnuncio,
  TipoOperacion,
} from "@/features/propiedades/types";

import {
  DEFAULT_LOCALE,
  type Dictionary,
  dictionaries,
  type Locale,
} from "./dictionaries";

const STORAGE_KEY = "mii.locale";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  dict: Dictionary;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") {
      setLocaleState(saved);
    } else {
      const navLang = window.navigator.language?.slice(0, 2);
      if (navLang === "en") setLocaleState("en");
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      dict: dictionaries[locale],
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}

export function useDict() {
  return useLocale().dict;
}

const numberLocales: Record<Locale, string> = {
  es: "es-PA",
  en: "en-US",
};

export function useDomainLabels() {
  const { dict } = useLocale();
  return useMemo(
    () => ({
      categoria: (c: CategoriaPropiedad) => dict.domain.category[c],
      tipoOperacion: (t: TipoOperacion) => dict.domain.operation[t],
      tipoOperacionCorto: (t: TipoOperacion) => dict.domain.operation_short[t],
      condicion: (c: Condicion | undefined) =>
        c ? dict.domain.condition[c] : "—",
      estado: (e: EstadoAnuncio) => dict.domain.status[e],
    }),
    [dict],
  );
}

export function useFormatters() {
  const { locale } = useLocale();
  return useMemo(() => {
    const tag = numberLocales[locale];
    const currency = new Intl.NumberFormat(tag, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    const number = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
    const date = new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return {
      currency: (v: number) => currency.format(v),
      number: (v: number) => number.format(v),
      date: (iso: string) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? iso : date.format(d);
      },
    };
  }, [locale]);
}
