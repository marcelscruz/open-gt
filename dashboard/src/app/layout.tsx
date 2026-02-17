import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GT7 Telemetry",
  description: "Gran Turismo 7 Real-Time Telemetry Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
