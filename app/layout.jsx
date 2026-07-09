import "./globals.css";

export const metadata = {
  title: "FPS ID QR 生成器",
  description: "生成香港轉數快 FPS ID、電話號碼或電郵收款 QR Code。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
