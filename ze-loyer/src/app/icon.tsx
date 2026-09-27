import { ImageResponse } from "next/og";

export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
    { id: "maskable", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const key = await id;
  const size = key === "192" ? 192 : 512;
  const maskable = key === "maskable";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f5f3e", borderRadius: maskable ? 0 : size * 0.2 }}>
        <div style={{ display: "flex", color: "white", fontSize: size * (maskable ? 0.32 : 0.42), fontWeight: 800, letterSpacing: -size * 0.01 }}>ZL</div>
      </div>
    ),
    { width: size, height: size },
  );
}
