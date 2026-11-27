"use client";

import Link from "next/link";
import { profileInitials } from "@/domain/profile";
import { es } from "@/lib/i18n/es";
import { useProfile } from "./auth-context";

/**
 * The global profile as other modules show it (Configuración, Informes): same record, read
 * through the same context — never a copy.
 */
export function ProfileSummary({ context }: { context?: string }) {
  const view = useProfile();
  if (!view) return null;
  const { profile } = view;
  return (
    <section aria-label={es.profile.title} className="mb-6 flex flex-wrap items-center gap-4 rounded-sm border border-line bg-surface px-4 py-3" data-testid="profile-summary">
      <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-gold-tint type-body-sm font-semibold text-gold-text ring-1 ring-gold/40">
        {profileInitials(profile)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate type-body font-semibold text-ink">{profile.fullName || profile.username}</p>
        <p className="type-caption text-ink-2">
          {context ? `${context} · ` : ""}
          {es.common.currencies[view.preferredCurrency]}
          {profile.secondaryCurrency ? ` · ${es.profile.secondaryCurrency}: ${profile.secondaryCurrency}` : ""} · {es.profile.dateFormats[profile.dateFormat]}
        </p>
      </div>
      <Link href="/perfil" className="type-nav text-lake underline-offset-4 hover:underline">
        {es.profile.menuProfile}
      </Link>
    </section>
  );
}
