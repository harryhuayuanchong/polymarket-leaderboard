import "./globals.css";
import ServiceWorker from "./components/ServiceWorker";
import Header from "./components/Header";

export const metadata = {
  title: "Polymarket Leaderboard",
  description: "Top traders & biggest wins on Polymarket",
  manifest: "/manifest.webmanifest",
  themeColor: "#0b1a25",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
