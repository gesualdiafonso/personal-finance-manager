"use client";

import { AREAS } from "@/lib/config/navigation";

/**
 * "Nueva transacción" from anywhere (sidebar, rail, the phone's "+", key N — D4-15): on the
 * Transactions page it opens the sheet directly (an event); elsewhere it goes to
 * /transacciones#nueva, and the page opens the sheet when it sees the hash.
 */
export const NEW_TRANSACTION_HREF = `${AREAS.transactions.href}#nueva`;
export const NEW_TRANSACTION_EVENT = "pfm:new-transaction";

export function isOnTransactions(pathname: string | null): boolean {
  return pathname === AREAS.transactions.href;
}

/** onClick for the global links: same page → open the sheet without navigating. */
export function openNewTransactionHere(
  e: { preventDefault: () => void },
  pathname: string | null,
): void {
  if (!isOnTransactions(pathname)) return;
  e.preventDefault();
  window.dispatchEvent(new Event(NEW_TRANSACTION_EVENT));
}
