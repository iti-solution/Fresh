import type { NextConfig } from "next";

// Cache Components / Partial Prefetching celowo wyłączone (ADR-8): cała aplikacja jest za logowaniem
// i renderowana dynamicznie per użytkownik/firma. Wrócimy do tematu, gdy pojawią się strony publiczne (M2).
const nextConfig: NextConfig = {
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
