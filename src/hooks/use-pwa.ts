"use client";

import { useSyncExternalStore } from "react";
import {
  installState,
  isOnline,
  subscribeInstall,
  subscribeOnline,
  subscribeUpdate,
  updateWaiting,
  type InstallState,
} from "@/services/pwa/runtime";

/** Install state; "unknown" during the server render and hydration. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribeInstall, installState, () => "unknown");
}

/** navigator.onLine, followed live; assumed online on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline, () => true);
}

/** True when a new version of the app is installed and waiting for the user. */
export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(subscribeUpdate, () => updateWaiting() !== null, () => false);
}
