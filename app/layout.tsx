import "./globals.css";

export const metadata = {
  title: "Polymarket Leaderboard",
  description: "Top traders & biggest wins on Polymarket",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
