import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { AppearanceInit } from "@/components/ui/appearance-init";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const openRunde = localFont({
  variable: "--font-open-runde",
  src: [
    { path: "../../public/fonts/open-runde/OpenRunde-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/open-runde/OpenRunde-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/open-runde/OpenRunde-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/open-runde/OpenRunde-Bold.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/open-runde/OpenRunde-Regular.woff", weight: "400", style: "normal" },
    { path: "../../public/fonts/open-runde/OpenRunde-Medium.woff", weight: "500", style: "normal" },
    { path: "../../public/fonts/open-runde/OpenRunde-Semibold.woff", weight: "600", style: "normal" },
    { path: "../../public/fonts/open-runde/OpenRunde-Bold.woff", weight: "700", style: "normal" },
  ],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OhMyDashboard",
  description:
    "A unified dashboard for indie hackers to track all their business metrics in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${openRunde.variable} ${geistSans.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <AppearanceInit />
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
