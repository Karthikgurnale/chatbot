import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Knowledge Assistant",
  description: "AI-powered knowledge assistant - Explore documents and get instant answers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased bg-[var(--bg-deep)]`}
    >
      <body className="min-h-full flex flex-col bg-[var(--bg-deep)] text-[var(--text-primary)] transition-colors duration-200">{children}</body>
    </html>
  );
}

