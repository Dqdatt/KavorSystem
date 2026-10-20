import "@kavor/web-ui/styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kavor HR/Admin",
  description: "Trung tâm vận hành nhân sự của doanh nghiệp trên Kavor",
  icons: { icon: "/kavor-logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
