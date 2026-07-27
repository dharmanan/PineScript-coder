import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kohen Pine Studio",
  description: "Kohen Pine Studio — deterministic Pine Script v6 indicator builder",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
