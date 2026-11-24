import type { Metadata } from "next";
import { AccountsPage } from "@/features/accounts/accounts-page";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.accounts.label };

/** Static shell; accounts are read on the client from this device's IndexedDB. */
export default function Page() {
  return <AccountsPage />;
}
