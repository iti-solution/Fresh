import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: { default: "Kierowca", template: "%s · Fresh kierowca" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f2a48" };

// Aplikacja kierowcy: jedna kolumna, duże przyciski (min. 48 px), obsługa jedną ręką na telefonie/terminalu Zebra.
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">{children}</div>;
}
