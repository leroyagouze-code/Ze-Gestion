import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZE LOYER — La gestion locative, simplement.",
    short_name: "ZE LOYER",
    description: "Loyers, locataires, quittances : votre carnet locatif toujours avec vous.",
    start_url: "/connexion",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf8f3",
    theme_color: "#0f5f3e",
    lang: "fr",
    categories: ["finance", "productivity", "business"],
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
