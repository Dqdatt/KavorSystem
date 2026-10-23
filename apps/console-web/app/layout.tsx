import "./kavor-desktop.css";
import "./console.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kavor Console",
  description: "Bảng điều khiển vận hành nền tảng Kavor",
  applicationName: "Kavor Console",
  icons: { icon: "/kavor-logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
