import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Depong — Momen sahabat, langsung di layar",
  description:
    "Kirim foto momen ke sahabat terdekatmu. Web app ala Locket yang bisa di-install di HP.",
  applicationName: "Depong",
  appleWebApp: {
    capable: true,
    title: "Depong",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050505",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full">
      <body className="h-full bg-black font-sans text-white antialiased">{children}</body>
    </html>
  );
}
