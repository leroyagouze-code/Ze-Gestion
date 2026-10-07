import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ZE LOYER — La gestion locative, simplement.", template: "%s · ZE LOYER" },
  description: "Gérez vos logements, vos loyers et vos locataires depuis votre téléphone. Le carnet locatif numérique partagé.",
  applicationName: "ZE LOYER",
  appleWebApp: { capable: true, title: "ZE LOYER", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f5f3e", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
