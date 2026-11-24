import type { Metadata } from "next";
import { TransactionsPage } from "@/features/transactions/transactions-page";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.transactions.label };

/** Static shell; transactions are read and written on the client, in this device's IndexedDB. */
export default function Page() {
  return <TransactionsPage />;
}
