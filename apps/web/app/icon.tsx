import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** A tiny amber receipt, readable at favicon size. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#07090d", borderRadius: 14 }}>
        <div style={{ width: 34, height: 44, display: "flex", flexDirection: "column", justifyContent: "space-around", padding: "6px 6px 10px 6px", background: "#f0b429", borderRadius: 3 }}>
          <div style={{ height: 4, width: "100%", background: "#07090d", borderRadius: 2 }} />
          <div style={{ height: 4, width: "70%", background: "#07090d", borderRadius: 2 }} />
          <div style={{ height: 4, width: "85%", background: "#07090d", borderRadius: 2 }} />
        </div>
      </div>
    ),
    size,
  );
}
