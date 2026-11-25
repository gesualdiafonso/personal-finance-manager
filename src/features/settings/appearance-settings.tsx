"use client";

import { useTheme } from "@/components/shared/theme-provider";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { THEME_PREFERENCES } from "@/services/storage/preferences";

/** Settings → Appearance: Sistema · Claro · Oscuro, stored in LocalStorage (modo-escuro.md §5). */
export function AppearanceSettings() {
  const { preference, setPreference } = useTheme();
  return (
    <section
      aria-labelledby="apariencia"
      className="grid gap-4 border-t border-line py-6 desktop:grid-cols-12 desktop:gap-6"
    >
      <div className="desktop:col-span-4">
        <h2 id="apariencia" className="type-heading">
          {es.settings.appearance}
        </h2>
        <p className="type-body-sm text-ink-2">{es.settings.appearanceHint}</p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="apariencia"
        className="grid h-10 grid-cols-3 rounded-sm bg-paper-2 p-0.75 desktop:col-span-6 desktop:max-w-[420px]"
      >
        {THEME_PREFERENCES.map((value) => {
          const checked = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={checked}
              data-theme-option={value}
              onClick={() => setPreference(value)}
              className={cn(
                "rounded-xs type-nav text-ink-2",
                checked && "bg-surface font-semibold text-ink ring-1 ring-line",
              )}
            >
              {es.settings.theme[value]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
