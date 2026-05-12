import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DO Lifecycle Scheduler",
  description: "Manage DigitalOcean Droplet lifecycle scheduling",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-do-dark text-do-text">{children}</body>
    </html>
  );
}
