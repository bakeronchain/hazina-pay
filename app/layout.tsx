import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "HazinaVault — Forced Savings on Stacks",
  description:
    "Lock stablecoins for 1–12 months, earn yield, and unlock emergency funds with AI-reviewed withdrawals.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
