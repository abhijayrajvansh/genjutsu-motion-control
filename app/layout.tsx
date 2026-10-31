import type { Metadata } from "next";
import "./reference.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Generations · Aiorbust",
  description: "A local recreation of the Aiorbust generation workspace.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
