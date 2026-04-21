import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Canto AI Suite",
  description: "Your DAM, smarter.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-[#1A1A1A]">
        {children}
        <footer className="mt-auto border-t border-[#F0F0F0]">
          <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-6 text-xs text-[#9A9A9A]">
            <span>Canto AI Suite</span>
            <a
              href="/diagnostics"
              className="transition-colors hover:text-[#6B6B6B]"
            >
              Diagnostics
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
