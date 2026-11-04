import type { MetadataRoute } from "next";
import { t } from "@/i18n";

// Colours are the light theme's ground (globals.css --ground). The PNGs in public/ are the
// Candid mark rendered from src/app/icon.svg; they sit inside the maskable safe zone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t.common.appName,
    short_name: t.common.appName,
    description: t.common.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#f2f4f7",
    theme_color: "#f2f4f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
