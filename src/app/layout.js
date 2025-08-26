export const metadata = {
  title: "Firestore CSV Export",
  description: "Export Firestore documents to CSV",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

import Providers from "./providers";

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
