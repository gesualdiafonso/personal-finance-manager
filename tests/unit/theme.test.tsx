import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { AppearanceSettings } from "@/features/settings/appearance-settings";
import { PREFERENCE_KEYS, readPreference, resolveTheme, THEME_INIT_SCRIPT, writePreference } from "@/services/storage/preferences";

const media = (globalThis as unknown as { __prefersDark: { dark: boolean } }).__prefersDark;

function renderSettings() {
  return render(
    <ThemeProvider>
      <AppearanceSettings />
    </ThemeProvider>,
  );
}

describe("theme persistence", () => {
  it("stores the choice in LocalStorage and applies it to <html>", async () => {
    renderSettings();
    await userEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(window.localStorage.getItem("pfm.theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: "Oscuro" })).toHaveAttribute("aria-checked", "true");
  });

  it("restores the stored choice on the next visit", () => {
    window.localStorage.setItem("pfm.theme", "dark");
    renderSettings();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: "Oscuro" })).toHaveAttribute("aria-checked", "true");
  });

  it("follows the system preference when set to Sistema", () => {
    media.dark = true;
    renderSettings();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: "Sistema" })).toHaveAttribute("aria-checked", "true");
  });

  it("ignores an invalid stored value", () => {
    window.localStorage.setItem("pfm.theme", "neon");
    expect(readPreference("pfm.theme")).toBeNull();
    renderSettings();
    expect(document.documentElement.getAttribute("data-theme")).toBe("paper");
  });

  it("still switches for the session when LocalStorage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    renderSettings();
    await act(async () => {
      await userEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("init script applies the stored theme before React runs", () => {
    window.localStorage.setItem("pfm.theme", "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("LocalStorage preferences", () => {
  it("only knows lightweight, non-financial keys", () => {
    expect(PREFERENCE_KEYS.sort()).toEqual(["pfm.dashboard.granularity", "pfm.dashboard.period", "pfm.obligations.lastArea", "pfm.quickAdd.lastAccountId", "pfm.theme"]);
  });

  it("validates values before writing", () => {
    expect(() => writePreference("pfm.dashboard.period", "noviembre" as never)).toThrow();
    expect(writePreference("pfm.dashboard.period", "2026-11")).toBe(true);
    expect(readPreference("pfm.dashboard.period")).toBe("2026-11");
    // Step 07: the Panel granularity is a closed list of view settings.
    expect(() => writePreference("pfm.dashboard.granularity", "decade" as never)).toThrow();
    expect(writePreference("pfm.dashboard.granularity", "quarter")).toBe(true);
    expect(readPreference("pfm.dashboard.granularity")).toBe("quarter");
  });

  it("resolves the theme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("paper");
    expect(resolveTheme("paper", true)).toBe("paper");
  });
});
