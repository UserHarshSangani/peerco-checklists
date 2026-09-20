import type { MetadataRoute } from "next";

// Colours mirror the light theme tokens in app/globals.css (--color-bg /
// --color-accent) — the manifest can't read CSS variables, so they're
// duplicated here by value.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PeerCo Checklists",
    short_name: "Checklists",
    description: "Outlet checklists for PeerCo staff.",
    start_url: "/tablet",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
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
