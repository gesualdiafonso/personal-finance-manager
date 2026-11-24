import type { Metadata } from "next";
import { BillsPage } from "@/features/bills/bills-page";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.bills.label };

/** Static shell; bills are read and written on the client, in this device's IndexedDB. */
export default function Page() {
  return <BillsPage />;
}
