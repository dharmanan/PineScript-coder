import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PineForge Studio",
  description: "Deterministic Pine Script v6 strategy and indicator builder"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
