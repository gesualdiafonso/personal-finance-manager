"use client";

import { useSyncExternalStore } from "react";

/**
 * Id of a detail page (/cuentas/<id>, /tarjetas/<id>), read from the address bar — not from
 * the server payload — so the same cached shell can open any id offline (sw.template.js,
 * DETAIL_SHELLS). Moving to another id remounts the page (new route segment), and back/forward
 * fire popstate. Null during prerender (no Suspense boundary needed).
 */
const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

export function useDetailId(): string | null {
  const path = useSyncExternalStore(subscribe, () => window.location.pathname, () => null);
  if (!path) return null;
  const id = decodeURIComponent(path.split("/")[2] ?? "");
  return id === "" ? null : id;
}
