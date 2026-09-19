import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "RenderVid — Create anything. Without knowing how.",
  description:
    "Generate professional images, videos and marketing creatives from one simple AI studio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-ink-950 text-fog-100 antialiased">{children}</body>
    </html>
  );
}
