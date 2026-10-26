import "@kavor/web-ui/kavor.css";
import { themeInitScript } from "@kavor/web-ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kavor HR",
  description: "Trung tâm vận hành nhân sự của doanh nghiệp trên Kavor",
  applicationName: "Kavor HR",
  icons: { icon: "/kavor-logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
