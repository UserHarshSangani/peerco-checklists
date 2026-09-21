import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/brand";

// Colours mirror the light theme tokens in app/globals.css (--color-bg /
// --color-sidebar) — the manifest can't read CSS variables, so they're
// duplicated here by value.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: "Daily checklists, stock and variance for PeerCo outlets.",
    start_url: "/tablet",
    display: "standalone",
    background_color: "#f6f2ea",
    theme_color: "#0f4a2e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
