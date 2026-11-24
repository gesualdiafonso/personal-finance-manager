import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AppearanceSettings } from "@/features/settings/appearance-settings";
import { InstallSettings } from "@/features/settings/install-settings";
import { LocalDataPanel } from "@/features/settings/local-data-panel";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.settings.label };

/** Settings uses the "Formulário" archetype: explanation left (4 cols), controls right (6 cols). */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title={AREAS.settings.label} />
      <AppearanceSettings />
      <InstallSettings />
      <LocalDataPanel />
    </>
  );
}
