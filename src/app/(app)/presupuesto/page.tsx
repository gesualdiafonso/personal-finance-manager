import type { Metadata } from "next";
import { PlanningPage } from "@/features/planning/planning-page";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.budget.label };

/** Static shell; budgets and goals are read and written on the client, in this device's IndexedDB. */
export default function Page() {
  return <PlanningPage />;
}
