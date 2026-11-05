import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

// Wydruki (A4): bez menu panelu, białe tło, czytelne na drukarce czarno-białej.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white px-6 py-6 text-black print:p-0 [&_*]:print:shadow-none">{children}</div>;
}
