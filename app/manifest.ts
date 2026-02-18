import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Polymarket Leaderboard",
    short_name: "PM Leaderboard",
    description: "Top traders & biggest wins on Polymarket",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1a25",
    theme_color: "#0b1a25",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
