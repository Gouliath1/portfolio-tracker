import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Omit width=device-width so browsers use the default ~980px desktop viewport.
// This lets the browser's "Request Desktop Site" feature work correctly: iOS
// Safari and Chrome Android can switch to their desktop viewport width without
// the meta tag fighting them back to the physical device width.
export const viewport: Viewport = {
  initialScale: 1,
  minimumScale: 0.25,
  userScalable: true,
};

export const metadata: Metadata = {
  title: "Portfolio Tracker",
  description: "Created by Gouliath & Co.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
