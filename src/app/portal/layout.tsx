import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: { default: "Portal zamówień", template: "%s · Fresh TMS portal zamówień" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f2a48" };

// Portal zamówień klienta hurtowni (restauracja, hotel, sklep): telefon wieczorem po zamknięciu kuchni,
// więc jedna kolumna, duże przyciski (min. 48 px) i jak najmniej pisania.
export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
