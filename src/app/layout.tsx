import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sheaf | Investment & Career Intelligence",
  description: "Interactive graph visualizer for investment news and entity impact.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
