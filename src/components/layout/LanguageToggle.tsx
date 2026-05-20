"use client";

import { Languages } from "lucide-react";

import { cn } from "@/lib/utils";
import { LOCALES, type Locale } from "@/i18n/dictionaries";
import { useLocale } from "@/i18n/LocaleProvider";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, dict } = useLocale();

  return (
    <div className={cn("w-full px-1 py-1", className)}>
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Languages className="size-3" />
        <span>{dict.nav.language}</span>
      </div>
      <div
        role="group"
        aria-label={dict.nav.language}
        className="grid grid-cols-2 gap-1 rounded-md border border-border/60 bg-card/40 p-0.5"
      >
        {LOCALES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setLocale(l.code as Locale)}
            aria-pressed={locale === l.code}
            className={cn(
              "rounded-sm px-2 py-1 text-xs font-medium tracking-wide transition-colors",
              locale === l.code
                ? "bg-[#D6FF00]/15 text-[#D6FF00]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.short}
          </button>
        ))}
      </div>
    </div>
  );
}
