import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { AREAS } from "@/lib/config/navigation";
import { ProfileSummary } from "@/features/auth/profile-summary";
import { es } from "@/lib/i18n/es";

export const metadata: Metadata = { title: AREAS.reports.label };

export default function Page() {
  return <PlaceholderPage title={AREAS.reports.label} before={<ProfileSummary context={es.profile.reportsContext} />} />;
}
