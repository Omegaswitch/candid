import { ImageResponse } from "next/og";
import { t } from "@/i18n";

// The static link-preview card: the Candid mark and wordmark, ink on the light ground
// (globals.css --foreground on --ground). Static on purpose: previews never carry project data.
export const alt = `${t.common.appName} — ${t.common.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0a0a0a";
const GROUND = "#f2f4f7";
const MUTED = "#5f6368";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 112px",
          background: GROUND,
          color: INK,
          fontFamily: "Geist, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <svg width="128" height="128" viewBox="0 0 20 20">
            <rect x="1" y="1" width="18" height="18" rx="5" fill={INK} />
            <path d="M5 7.2l1.6 1.6L9.6 5.8" fill="none" stroke={GROUND} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11.5 7.5H15M5 13h10" fill="none" stroke={GROUND} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", fontSize: 128, lineHeight: 1, letterSpacing: -4 }}>{t.common.appName}</div>
        </div>
        <div style={{ display: "flex", marginTop: 56, fontSize: 36, lineHeight: 1.25, color: MUTED }}>{t.common.tagline}</div>
      </div>
    ),
    size,
  );
}
