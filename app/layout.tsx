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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { document.documentElement.dataset.theme = localStorage.getItem("clone.theme") === "dark" ? "dark" : "light"; } catch {}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
