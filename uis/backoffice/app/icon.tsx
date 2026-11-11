import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Browser-tab icon — same flame mark as components/Logo, generated at
 * build time so no binary asset needs to be created/kept in sync by hand.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#b23a21",
          borderRadius: 6,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#f9ede0">
          <path d="M12 2c-.3 2-2 3.6-3.4 5.2C6.9 9 6 10.8 6 13a6 6 0 0 0 12 0c0-1.8-.6-3-1.6-4.3-.2 1.6-1 2.6-1.9 3.1.3-2.2-.4-4-1.7-5.4C13.6 5.2 12.6 3.8 12 2Z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
