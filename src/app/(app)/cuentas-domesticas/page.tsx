import type { Metadata } from "next";
import { ObligationsSwitcher } from "@/components/layout/obligations-switcher";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { AREAS } from "@/lib/config/navigation";
import { es } from "@/lib/i18n/es";

export const metadata: Metadata = { title: AREAS.bills.label };

export default function Page() {
  return <PlaceholderPage label={es.nav.groups.obligations} title={AREAS.bills.label} before={<ObligationsSwitcher current="bills" />} />;
}
