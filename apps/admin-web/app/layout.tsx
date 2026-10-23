import "./kavor-desktop.css";
import "./admin.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kavor HR",
  description: "Trung tâm vận hành nhân sự của doanh nghiệp trên Kavor",
  applicationName: "Kavor HR",
  icons: { icon: "/kavor-logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
