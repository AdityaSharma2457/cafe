import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dishu’s Cafe",
  description: "Fresh from the oven · Made with love",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
