"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production builds only (in development a caching worker would serve
 * stale code). See docs/architecture/pwa.md for what the worker does and does not do yet.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration failure leaves the app fully usable online; nothing to show the user.
    });
  }, []);
  return null;
}
