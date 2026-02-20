"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type BubbleItem = {
  sourceMarketId: string;
  eventTitle: string;
  marketQuestion: string;
  price: number;
  liquidity: number;
  closeTime: string | null;
  eventUrl: string | null;
  imageUrl?: string | null;
};

type BubbleState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

export default function BubbleMap({
  items,
  onAnalyze,
  disabled,
}: {
  items: BubbleItem[];
  onAnalyze: (item: BubbleItem) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bubblesRef = useRef<BubbleState[]>([]);
  const [frame, setFrame] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => items.find((item) => item.sourceMarketId === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const width = Math.max(bounds.width, 320);
    const height = Math.max(bounds.height, 380);

    const next: BubbleState[] = items.map((item, index) => {
      const r = radius(item.liquidity);
      return {
        id: item.sourceMarketId,
        x: Math.max(r, Math.min(width - r, (index % 4) * (width / 4) + r + 24)),
        y: Math.max(r, Math.min(height - r, Math.floor(index / 4) * (height / 3) + r + 20)),
        vx: (Math.random() - 0.5) * 28,
        vy: (Math.random() - 0.5) * 28,
        r,
      };
    });

    bubblesRef.current = next;
    if (!selectedId && items[0]) setSelectedId(items[0].sourceMarketId);
    setFrame((n) => n + 1);
  }, [items, selectedId]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const container = containerRef.current;
      if (!container) return;

      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const bounds = container.getBoundingClientRect();
      const width = Math.max(bounds.width, 320);
      const height = Math.max(bounds.height, 380);
      const bubbles = bubblesRef.current;

      for (const bubble of bubbles) {
        bubble.vx += (Math.random() - 0.5) * 4.5 * dt;
        bubble.vy += (Math.random() - 0.5) * 4.5 * dt;
        bubble.vx *= 0.995;
        bubble.vy *= 0.995;
        bubble.x += bubble.vx * dt * 16;
        bubble.y += bubble.vy * dt * 16;

        if (bubble.x - bubble.r < 0) {
          bubble.x = bubble.r;
          bubble.vx = Math.abs(bubble.vx) * 0.9;
        }
        if (bubble.x + bubble.r > width) {
          bubble.x = width - bubble.r;
          bubble.vx = -Math.abs(bubble.vx) * 0.9;
        }
        if (bubble.y - bubble.r < 0) {
          bubble.y = bubble.r;
          bubble.vy = Math.abs(bubble.vy) * 0.9;
        }
        if (bubble.y + bubble.r > height) {
          bubble.y = height - bubble.r;
          bubble.vy = -Math.abs(bubble.vy) * 0.9;
        }
      }

      for (let i = 0; i < bubbles.length; i += 1) {
        for (let j = i + 1; j < bubbles.length; j += 1) {
          const a = bubbles[i];
          const b = bubbles[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.0001;
          const minDist = a.r + b.r + 2;

          if (dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            a.x -= nx * (overlap * 0.5);
            a.y -= ny * (overlap * 0.5);
            b.x += nx * (overlap * 0.5);
            b.y += ny * (overlap * 0.5);

            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel < 0) {
              const impulse = -rel * 0.35;
              a.vx -= impulse * nx;
              a.vy -= impulse * ny;
              b.vx += impulse * nx;
              b.vy += impulse * ny;
            }
          }
        }
      }

      setFrame((n) => n + 1);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="weather-bubble-map">
      <div className="weather-bubble-map__board" ref={containerRef}>
        {bubblesRef.current.map((bubble) => {
          const item = items.find((row) => row.sourceMarketId === bubble.id);
          if (!item) return null;

          return (
            <button
              key={bubble.id}
              type="button"
              className={`weather-float-bubble ${selectedId === item.sourceMarketId ? "is-selected" : ""}`}
              style={{
                width: bubble.r * 2,
                height: bubble.r * 2,
                transform: `translate(${bubble.x - bubble.r}px, ${bubble.y - bubble.r}px)`,
              }}
              onClick={() => setSelectedId(item.sourceMarketId)}
              title={item.marketQuestion}
            >
              {item.imageUrl ? (
                <span className="weather-float-bubble__image" style={{ backgroundImage: `url(${item.imageUrl})` }} />
              ) : (
                <span className="weather-float-bubble__fallback">{initials(item.eventTitle)}</span>
              )}
              <span className="weather-float-bubble__label">{truncate(item.marketQuestion, 24)}</span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <aside className="weather-bubble-map__panel">
          <h3>{selected.marketQuestion}</h3>
          <p>{selected.eventTitle}</p>
          <div className="weather-bubble-map__stats">
            <span>Price: {pct(selected.price)}</span>
            <span>Liquidity: {usd(selected.liquidity)}</span>
            <span>Close: {fmtDate(selected.closeTime)}</span>
          </div>
          <div className="weather-bubble-map__actions">
            <button
              type="button"
              className="weather-analyze-btn"
              onClick={() => onAnalyze(selected)}
              disabled={disabled}
            >
              Analyze
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function radius(liquidity: number) {
  const scaled = 36 + Math.sqrt(Math.max(liquidity, 0)) * 0.38;
  return Math.max(34, Math.min(84, scaled));
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    value
  );
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}
