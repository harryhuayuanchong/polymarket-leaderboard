"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Header() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const resolved = stored === "dark" ? "dark" : "light";
    setTheme(resolved);
    document.body.dataset.theme = resolved;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.body.dataset.theme = nextTheme;
    window.localStorage.setItem("theme", nextTheme);
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-logo" aria-label="PolyResearch Home">
          PolyResearch
        </Link>

        <div className="site-header__actions">
          <nav className="site-nav" aria-label="Primary">
            <Link href="/" className={`site-nav__link ${pathname === "/" ? "is-active" : ""}`}>
              Leaderboard
            </Link>
            <Link
              href="/labs/weather"
              className={`site-nav__link ${pathname.startsWith("/labs/weather") ? "is-active" : ""}`}
            >
              Weather Labs
            </Link>
          </nav>
          <button className="site-theme-btn" onClick={toggleTheme} type="button">
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </div>
    </header>
  );
}
