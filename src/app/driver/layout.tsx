import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import { RegisterDriverSW } from "@/modules/execution/ui/register-sw";

export const metadata: Metadata = {
  title: { default: "Kierowca", template: `%s · ${BRAND.full} kierowca` },
  manifest: "/driver.webmanifest",
  icons: { apple: "/icons/driver-192.png" },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: BRAND.themeColor };

// Aplikacja kierowcy: jedna kolumna, duże przyciski (min. 48 px), obsługa jedną ręką na telefonie/terminalu Zebra.
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <RegisterDriverSW />
      {children}
    </div>
  );
}
