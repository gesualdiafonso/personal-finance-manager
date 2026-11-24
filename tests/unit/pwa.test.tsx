import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionStatus } from "@/components/layout/connection-status";
import { UpdatePrompt } from "@/components/shared/pwa-runtime";
import { InstallSettings } from "@/features/settings/install-settings";
import { AREAS } from "@/lib/config/navigation";
import {
  __resetPwaRuntime,
  applyUpdate,
  installState,
  isIos,
  registerServiceWorker,
  resolveInstallState,
  startInstallCapture,
  updateWaiting,
} from "@/services/pwa/runtime";

/** PWA runtime (Step 09): install, connection, updates, and the service worker template. */
afterEach(() => __resetPwaRuntime());

function installPromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
  e.prompt = vi.fn(async () => {});
  e.userChoice = Promise.resolve({ outcome, platform: "web" });
  return e;
}

describe("install state", () => {
  it("installed wins; then the native prompt; then iOS instructions; else unsupported", () => {
    const base = { standalone: false, installedNow: false, hasPrompt: false, ios: false };
    expect(resolveInstallState({ ...base, standalone: true, hasPrompt: true })).toBe("installed");
    expect(resolveInstallState({ ...base, installedNow: true })).toBe("installed");
    expect(resolveInstallState({ ...base, hasPrompt: true })).toBe("available");
    expect(resolveInstallState({ ...base, ios: true })).toBe("ios");
    expect(resolveInstallState(base)).toBe("unsupported");
  });

  it("detects iPhone and iPadOS (a Mac with touch), not a desktop Mac", () => {
    expect(isIos({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 })).toBe(false);
  });

  it("captures beforeinstallprompt (no mini-infobar), shows the native prompt on demand, hides once installed", async () => {
    startInstallCapture();
    render(<InstallSettings />);
    expect(screen.getByTestId("install-settings")).toHaveTextContent("Este navegador no ofrece instalar");
    const e = installPromptEvent("accepted");
    act(() => {
      window.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
    expect(installState()).toBe("available");
    await userEvent.click(screen.getByRole("button", { name: "Instalar PFM" }));
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("install-settings")).not.toBeInTheDocument(); // already installed: no install message
  });

  it("a dismissed prompt is single-use and says so; appinstalled hides the section", async () => {
    startInstallCapture();
    render(<InstallSettings />);
    act(() => {
      window.dispatchEvent(installPromptEvent("dismissed"));
    });
    await userEvent.click(screen.getByRole("button", { name: "Instalar PFM" }));
    expect(screen.getByTestId("install-settings")).toHaveTextContent("Instalación cancelada");
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByTestId("install-settings")).not.toBeInTheDocument();
  });
});

describe("connection", () => {
  const setOnline = (value: boolean) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  };
  afterEach(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }));

  it("says nothing online; offline explains the data stays on the device; back online once, then hides", () => {
    vi.useFakeTimers();
    render(<ConnectionStatus />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => setOnline(false));
    expect(screen.getByTestId("connection-offline")).toHaveTextContent("lo que registres se guarda aquí");
    expect(screen.getByTestId("connection-offline")).not.toHaveTextContent(/sincroniz/i);
    act(() => setOnline(true));
    expect(screen.getByTestId("connection-restored")).toHaveTextContent("Conexión restablecida.");
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe("service worker updates", () => {
  function fakeWorker(state: string) {
    const target = new EventTarget() as EventTarget & { state: string; postMessage: ReturnType<typeof vi.fn> };
    target.state = state;
    target.postMessage = vi.fn();
    return target;
  }
  function fakeContainer(registration: object, controller: object | null) {
    const target = new EventTarget() as EventTarget & { controller: object | null; register: ReturnType<typeof vi.fn> };
    target.controller = controller;
    target.register = vi.fn(async () => registration);
    return target as unknown as ServiceWorkerContainer;
  }

  it("a waiting worker is offered (never applied by itself); applying posts SKIP_WAITING and reloads once", async () => {
    const waiting = fakeWorker("installed");
    const registration = Object.assign(new EventTarget(), { waiting, installing: null, update: vi.fn(async () => {}) });
    const sw = fakeContainer(registration, {});
    await registerServiceWorker(sw);
    expect(updateWaiting()).toBe(waiting);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    render(<UpdatePrompt />);
    expect(screen.getByTestId("update-prompt")).toHaveTextContent("Hay una nueva versión de la aplicación.");
    const reload = vi.fn();
    applyUpdate(sw, reload);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    sw.dispatchEvent(new Event("controllerchange"));
    sw.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the first install (no controller yet) is not an update", async () => {
    const installing = fakeWorker("installing");
    const registration = Object.assign(new EventTarget(), { waiting: null, installing, update: vi.fn(async () => {}) });
    await registerServiceWorker(fakeContainer(registration, null));
    installing.state = "installed";
    installing.dispatchEvent(new Event("statechange"));
    expect(updateWaiting()).toBeNull();
  });
});

describe("service worker template", () => {
  const template = readFileSync(resolve(__dirname, "../../scripts/pwa/sw.template.js"), "utf8");
  it("precaches every area shell, the offline page and every icon", () => {
    const list = JSON.parse(/const AREA_SHELLS = (\[[^\]]+\]);/.exec(template)![1]!);
    expect(new Set(list)).toEqual(new Set(Object.values(AREAS).map((a) => a.href)));
    for (const url of ["/offline", "/favicon.ico", "/icons/favicon-32.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png"]) expect(template).toContain(`"${url}"`);
  });
  it("versioned caches, old ones deleted, never /data/, GET and same origin only", () => {
    expect(template).toContain("__PFM_SW_VERSION__");
    expect(template).toMatch(/caches\.delete\(key\)/);
    expect(template).toContain('url.pathname.startsWith("/data/")) return');
    expect(template).toContain('request.method !== "GET") return');
    expect(template).toContain("url.origin !== self.location.origin) return");
  });
});
