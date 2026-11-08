import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist";
import "./globals.css";
import { BRAND } from "@/lib/brand";
import { WorkspaceProvider } from "@/lib/store";
import { ClientWorkspace } from "@/components/layout/ClientWorkspace";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
  ),
  title: BRAND.title,
  description: BRAND.description,
  applicationName: BRAND.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    title: BRAND.shortName,
    capable: true,
    statusBarStyle: "default",
  },
  openGraph: {
    title: BRAND.title,
    description: BRAND.description,
    siteName: BRAND.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.title,
    description: BRAND.description,
  },
};
export const viewport: Viewport = { themeColor: "#326b60" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>
          <ClientWorkspace>{children}</ClientWorkspace>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
