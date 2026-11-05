import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: { default: "Kierowca", template: `%s · ${BRAND.full} kierowca` } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: BRAND.themeColor };

// Aplikacja kierowcy: jedna kolumna, duże przyciski (min. 48 px), obsługa jedną ręką na telefonie/terminalu Zebra.
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">{children}</div>;
}
