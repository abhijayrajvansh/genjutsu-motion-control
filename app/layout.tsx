import type { Metadata } from "next";
import Script from "next/script";
import "./reference.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Genjutsu",
  description: "A local recreation of the Aiorbust generation workspace.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {`try { document.documentElement.dataset.theme = localStorage.getItem("clone.theme") === "dark" ? "dark" : "light"; } catch {}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
