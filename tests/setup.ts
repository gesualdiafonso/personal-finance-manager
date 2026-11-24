import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

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

beforeEach(() => {
  // A fresh, empty IndexedDB for every test.
  globalThis.indexedDB = new IDBFactory();
  window.localStorage.clear();
  media.dark = false;
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
});
