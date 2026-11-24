import type { Metadata } from "next";
import { AREAS } from "@/lib/config/navigation";
import { ReportsPage } from "@/features/reports/reports-page";

export const metadata: Metadata = { title: AREAS.reports.label };

/** Static shell; the reports are computed on the client from this device's IndexedDB. */
export default function Page() {
  return <ReportsPage />;
}
