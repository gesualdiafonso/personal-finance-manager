import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/shared/service-worker-register";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { APP_CONFIG } from "@/lib/config/app";
import { instrumentSans, instrumentSerif } from "@/lib/fonts";
import { es } from "@/lib/i18n/es";
import { THEME_INIT_SCRIPT } from "@/services/storage/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: es.app.name, template: `%s · ${es.app.name}` },
  description: es.app.description,
  applicationName: APP_CONFIG.fullName,
  appleWebApp: { capable: true, title: es.app.name, statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Replaced at runtime by ThemeProvider for the resolved theme.
  themeColor: "#F5F3ED",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={APP_CONFIG.htmlLang}
      data-theme="paper"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${instrumentSerif.variable}`}
    >
      <head>
        {/* Applies the stored theme before the first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
