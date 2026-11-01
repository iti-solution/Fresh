import type { NextConfig } from "next";

// Cache Components / Partial Prefetching celowo wyłączone (ADR-8): cała aplikacja jest za logowaniem
// i renderowana dynamicznie per użytkownik/firma. Wrócimy do tematu, gdy pojawią się strony publiczne (M2).
const nextConfig: NextConfig = {
  // Nagrania zamówień z portalu (do 2 min) idą przez akcję serwerową; Vercel przyjmuje do ~4,5 MB na żądanie.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
