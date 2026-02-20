"use client";

type Level = {
  price: number;
  size: number;
};

type Point = {
  x: number;
  y: number;
};

const WIDTH = 760;
const HEIGHT = 260;
const PAD_X = 24;
const PAD_Y = 20;

export default function OrderbookDepthChart({
  bids,
  asks,
  bestBid,
  bestAsk,
  unavailableReason,
}: {
  bids: Level[];
  asks: Level[];
  bestBid: number | null;
  bestAsk: number | null;
  unavailableReason?: string | null;
}) {
  const bidCurve = buildDepthCurve(bids, "bid");
  const askCurve = buildDepthCurve(asks, "ask");
  const maxDepth = Math.max(1, ...bidCurve.map((row) => row.depth), ...askCurve.map((row) => row.depth));
  const baselineY = HEIGHT - PAD_Y;

  const bidPoints = bidCurve.map((row) => toPoint(row.price, row.depth, maxDepth));
  const askPoints = askCurve.map((row) => toPoint(row.price, row.depth, maxDepth));

  const hasData = bidPoints.length > 0 || askPoints.length > 0;

  return (
    <div className="weather-depth-chart">
      {!hasData ? (
        <p className="weather-empty-note">
          {unavailableReason || "Orderbook depth unavailable for this market token."}
        </p>
      ) : (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Orderbook depth chart">
          <line x1={PAD_X} y1={baselineY} x2={WIDTH - PAD_X} y2={baselineY} className="weather-depth-axis" />
          <line x1={PAD_X} y1={PAD_Y} x2={PAD_X} y2={baselineY} className="weather-depth-axis" />

          {bestBid !== null ? (
            <line x1={toX(bestBid)} y1={PAD_Y} x2={toX(bestBid)} y2={baselineY} className="weather-depth-bidline" />
          ) : null}
          {bestAsk !== null ? (
            <line x1={toX(bestAsk)} y1={PAD_Y} x2={toX(bestAsk)} y2={baselineY} className="weather-depth-askline" />
          ) : null}

          {bidPoints.length > 0 ? <path d={toAreaPath(bidPoints, baselineY)} className="weather-depth-bid-area" /> : null}
          {askPoints.length > 0 ? <path d={toAreaPath(askPoints, baselineY)} className="weather-depth-ask-area" /> : null}
          {bidPoints.length > 0 ? <path d={toLinePath(bidPoints)} className="weather-depth-bid-line" /> : null}
          {askPoints.length > 0 ? <path d={toLinePath(askPoints)} className="weather-depth-ask-line" /> : null}
        </svg>
      )}
      <div className="weather-depth-legend">
        <span>Bid Depth</span>
        <span>Ask Depth</span>
      </div>
    </div>
  );
}

function buildDepthCurve(levels: Level[], side: "bid" | "ask") {
  const sorted = [...levels].sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  let cumulative = 0;

  return sorted.map((level) => {
    cumulative += level.size;
    return {
      price: clamp(level.price, 0.01, 0.99),
      depth: cumulative,
    };
  });
}

function toPoint(price: number, depth: number, maxDepth: number): Point {
  const x = toX(price);
  const usableHeight = HEIGHT - PAD_Y * 2;
  const y = HEIGHT - PAD_Y - (depth / maxDepth) * usableHeight;
  return { x, y };
}

function toX(price: number) {
  return PAD_X + price * (WIDTH - PAD_X * 2);
}

function toAreaPath(points: Point[], baselineY: number) {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${toLinePath(points)} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

function toLinePath(points: Point[]) {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
