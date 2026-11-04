import { ImageResponse } from "next/og";

// Home-screen icon: the Candid mark on the light ground (iOS rounds the corners itself).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const INK = "#141414";
const GROUND = "#f2f4f7";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: GROUND }}>
        <svg width="124" height="124" viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="18" rx="5" fill={INK} />
          <path d="M5 7.2l1.6 1.6L9.6 5.8" fill="none" stroke={GROUND} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11.5 7.5H15M5 13h10" fill="none" stroke={GROUND} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
