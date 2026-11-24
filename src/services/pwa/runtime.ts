/**
 * PWA runtime state (Step 09): installability, connection and service-worker updates.
 * Small external stores read with useSyncExternalStore (src/hooks/use-pwa.ts). Nothing here
 * touches financial data, and nothing is sent anywhere.
 */

/** The non-standard event Chromium fires when the app can be installed. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallState =
  /** Server render / not known yet. */
  | "unknown"
  /** Running as an installed app (standalone window or iOS home screen). */
  | "installed"
  /** The browser offered installation: a button can show the native prompt. */
  | "available"
  /** iOS Safari: no prompt exists; install through Share → Add to Home Screen. */
  | "ios"
  /** The browser offers no installation (or it was already installed from this browser). */
  | "unsupported";

type Listener = () => void;
function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/* ------------------------------------------------------------------------------ */
/* Installation                                                                     */
/* ------------------------------------------------------------------------------ */

const deferred = store<BeforeInstallPromptEvent | null>(null);
const justInstalled = store(false);

export function isStandalone(win: Window = window): boolean {
  return (
    win.matchMedia?.("(display-mode: standalone)").matches === true ||
    win.matchMedia?.("(display-mode: window-controls-overlay)").matches === true ||
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone, iPod, and iPad (which reports itself as a Mac with touch since iPadOS 13). */
export function isIos(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> = navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/** Pure decision, so every combination is unit-tested. */
export function resolveInstallState(input: {
  standalone: boolean;
  installedNow: boolean;
  hasPrompt: boolean;
  ios: boolean;
}): InstallState {
  if (input.standalone || input.installedNow) return "installed";
  if (input.hasPrompt) return "available";
  if (input.ios) return "ios";
  return "unsupported";
}

export function installState(): InstallState {
  if (typeof window === "undefined") return "unknown";
  return resolveInstallState({
    standalone: isStandalone(),
    installedNow: justInstalled.get(),
    hasPrompt: deferred.get() !== null,
    ios: isIos(),
  });
}

export function subscribeInstall(l: Listener): () => void {
  const a = deferred.subscribe(l);
  const b = justInstalled.subscribe(l);
  return () => {
    a();
    b();
  };
}

/** Shows the browser's own install dialog. Returns the user's choice (the event is single-use). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred.get();
  if (!event) return "unavailable";
  deferred.set(null);
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") justInstalled.set(true);
  return outcome;
}

let started = false;
/**
 * Captures beforeinstallprompt as early as possible (called from the root layout): the event
 * fires once, often before any settings page is open. The browser's mini-infobar is kept from
 * appearing on its own; installing is offered in context (Configuración).
 */
export function startInstallCapture(win: Window = window): void {
  if (started) return;
  started = true;
  win.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred.set(e as BeforeInstallPromptEvent);
  });
  win.addEventListener("appinstalled", () => {
    deferred.set(null);
    justInstalled.set(true);
  });
}

/* ------------------------------------------------------------------------------ */
/* Connection                                                                       */
/* ------------------------------------------------------------------------------ */

export function subscribeOnline(l: Listener): () => void {
  window.addEventListener("online", l);
  window.addEventListener("offline", l);
  return () => {
    window.removeEventListener("online", l);
    window.removeEventListener("offline", l);
  };
}
export const isOnline = () => navigator.onLine;

/* ------------------------------------------------------------------------------ */
/* Service worker updates                                                           */
/* ------------------------------------------------------------------------------ */

const waiting = store<ServiceWorker | null>(null);
export const updateWaiting = () => waiting.get();
export const subscribeUpdate = (l: Listener) => waiting.subscribe(l);

/**
 * Registers /sw.js and watches for a new version. A new worker waits (it never takes over by
 * itself: that could reload the page in the middle of a form); the page shows "Nueva versión
 * disponible" and applies it only when the user asks (applyUpdate).
 */
export async function registerServiceWorker(sw: ServiceWorkerContainer = navigator.serviceWorker): Promise<void> {
  const registration = await sw.register("/sw.js", { scope: "/" });
  const track = (worker: ServiceWorker | null) => {
    if (!worker) return;
    const check = () => {
      // "installed" with a controller = an update (the very first install needs no prompt).
      if (worker.state === "installed" && sw.controller) waiting.set(worker);
    };
    check();
    worker.addEventListener("statechange", check);
  };
  if (registration.waiting && sw.controller) waiting.set(registration.waiting);
  track(registration.installing);
  registration.addEventListener("updatefound", () => track(registration.installing));
  // Look for a new build when the app comes back to the foreground or the network returns.
  const refresh = () => registration.update().catch(() => undefined);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
  window.addEventListener("online", refresh);
}

/** Activates the waiting worker; the page reloads once it controls the page. */
export function applyUpdate(sw: ServiceWorkerContainer = navigator.serviceWorker, reload: () => void = () => window.location.reload()): void {
  const worker = waiting.get();
  if (!worker) return;
  let reloaded = false;
  sw.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    reload();
  });
  worker.postMessage({ type: "SKIP_WAITING" });
}

/** Test helper: reset module state between tests. */
export function __resetPwaRuntime(): void {
  deferred.set(null);
  justInstalled.set(false);
  waiting.set(null);
  started = false;
}
