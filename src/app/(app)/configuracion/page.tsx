import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AboutBrand } from "@/features/settings/about-brand";
import { AppearanceSettings } from "@/features/settings/appearance-settings";
import { LocalDataPanel } from "@/features/settings/local-data-panel";
import { CurrencySettings } from "@/features/exchange/currency-settings";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.settings.label };

/** Settings uses the "Formulário" archetype: explanation left (4 cols), controls right (6 cols). */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title={AREAS.settings.label} />
      <AppearanceSettings />
      <CurrencySettings />
      <LocalDataPanel />
      <AboutBrand />
    </>
  );
}
