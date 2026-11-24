import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { resetLocalDb } from "@/hooks/use-local-data";

// jsdom has no <dialog> modal API: a minimal stand-in (open attribute + close event).
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom has no matchMedia; tests set `prefers-color-scheme` through this flag.
const media = { dark: false };
(globalThis as { __prefersDark?: typeof media }).__prefersDark = media;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: query.includes("dark") ? media.dark : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

beforeEach(async () => {
  // A fresh, empty IndexedDB for every test (and no connection kept from the previous one).
  await resetLocalDb();
  globalThis.indexedDB = new IDBFactory();
  window.localStorage.clear();
  media.dark = false;
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
});
