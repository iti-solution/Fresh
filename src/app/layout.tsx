import type { Metadata } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fresh", template: "%s · Fresh" },
  description: "Planowanie i realizacja tras dla hurtowni HoReCa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
