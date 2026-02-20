"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { explainGate, explainMetric } from "../../../../../lib/weather/explain";
import BacktestChart from "../../components/BacktestChart";
import OrderbookDepthChart from "../../components/OrderbookDepthChart";

type Detail = {
  id: string;
  event_title: string;
  event_url: string | null;
  market_question: string;
  schema_side: string | null;
  threshold_f: number | null;
  location_name: string | null;
  target_date: string | null;
  close_time: string | null;
  price: number | null;
  liquidity: number | null;
  forecast_temp_f: number | null;
  sigma_f: number | null;
  risk_profile: string;
  p_model: number | null;
  edge: number | null;
  ev_net: number | null;
  gates: Record<string, boolean>;
  signal: string;
  status: string;
  unsupported_reason: string | null;
  aiSummary: string;
  meta?: {
    orderbook?: {
      bestBid: number | null;
      bestAsk: number | null;
      mid: number | null;
      spread: number | null;
      spreadBps: number | null;
      volume: number | null;
      liquidity: number | null;
      minTick: number | null;
      minSize: number | null;
      active: boolean;
      closed: boolean;
      tokenId: string | null;
      tokenLabel: string | null;
      source: string;
      depth5c: {
        bidSize: number;
        askSize: number;
      };
      execution: {
        sampleSize: number;
        buyAvg: number | null;
        buySlippage: number | null;
        buyFillPct: number;
        sellAvg: number | null;
        sellSlippage: number | null;
        sellFillPct: number;
      };
      levels: {
        bids: Array<{ price: number; size: number }>;
        asks: Array<{ price: number; size: number }>;
      };
      unavailableReason?: string;
      debug?: {
        tokenResolution: string;
        reason: string | null;
        attempts: Array<{ endpoint: string; status: string; detail?: string | null }>;
      };
    };
    resolution?: {
      source: string | null;
      rules: string | null;
      endDate: string | null;
    };
    holders?: {
      available: boolean;
      source: string;
      rows: Array<{ holder: string; size: number | null; pctOfVisible: number | null }>;
      message?: string;
      debug?: {
        reason: string | null;
        attempts: Array<{ endpoint: string; status: string; detail?: string | null }>;
      };
    };
  };
  market_snapshot: Record<string, unknown>;
  forecast_snapshot: Record<string, unknown>;
};

type BacktestSummary = {
  total: number;
  passRate: number;
  watchRate: number;
  avgEdge: number | null;
  avgEvNet: number | null;
  avgPModel: number | null;
  hypotheticalReturn: number | null;
};

type BacktestRow = {
  id: string;
  event_title: string;
  signal: string;
  price: number | null;
  p_model: number | null;
  edge: number | null;
  ev_net: number | null;
  created_at: string;
};

export default function WeatherMarketDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Detail | null>(null);
  const [backtest, setBacktest] = useState<{ summary: BacktestSummary; rows: BacktestRow[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/weather/markets/${params.id}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json?.error || "Failed to load analysis.");
        return;
      }
      setData(json);

      const btResponse = await fetch(`/api/weather/markets/${params.id}/backtest`);
      if (btResponse.ok) {
        const bt = await btResponse.json().catch(() => null);
        if (bt?.summary && Array.isArray(bt?.rows)) {
          setBacktest({ summary: bt.summary, rows: bt.rows });
        }
      }
    }

    void load();
  }, [params.id]);

  if (error) {
    return (
      <main className="weather-page">
        <section className="weather-panel">
          <p>{error}</p>
          <Link href="/labs/weather">Back to Weather Labs</Link>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="weather-page">
        <section className="weather-panel">Loading analysis...</section>
      </main>
    );
  }

  return (
    <main className="weather-page">
      <section className="weather-panel weather-top-actions">
        <Link href="/labs/weather" className="weather-back-btn">
          ← Back to Event List
        </Link>
      </section>

      <section className="weather-panel">
        <p className="weather-eyebrow">Weather Analysis</p>
        <h1>{data.event_title}</h1>
        <p>{data.market_question}</p>
        <div className="weather-chip-row">
          <span className="weather-chip">Status: {data.status}</span>
          <span className="weather-chip">Signal: {data.signal}</span>
          <span className="weather-chip">Risk: {data.risk_profile}</span>
        </div>
      </section>

      <section className="weather-panel">
        <h2>Evaluation</h2>
        <div className="weather-grid-two">
          <Metric label="Market Price" value={percent(data.price)} hint={explainMetric("Market Price")} />
          <Metric
            label="Model Probability"
            value={percent(data.p_model)}
            hint={explainMetric("Model Probability")}
          />
          <Metric label="Edge" value={percent(data.edge)} hint={explainMetric("Edge")} />
          <Metric label="EV Net" value={percent(data.ev_net)} hint={explainMetric("EV Net")} />
          <Metric label="Forecast Temp" value={temp(data.forecast_temp_f)} hint={explainMetric("Forecast Temp")} />
          <Metric label="Sigma" value={temp(data.sigma_f)} hint={explainMetric("Sigma")} />
        </div>
      </section>

      <section className="weather-panel">
        <h2>Gates</h2>
        <div className="weather-chip-row">
          {Object.entries(data.gates || {}).map(([key, value]) => (
            <span key={key} className={`weather-chip ${value ? "weather-chip--ok" : "weather-chip--bad"}`}>
              {key}: {String(value)} · {explainGate(key)}
            </span>
          ))}
        </div>
      </section>

      <section className="weather-panel">
        <h2>AI Summary</h2>
        <div className="weather-report">{renderReport(data.aiSummary || data.unsupported_reason || "No summary available.")}</div>
      </section>

      <section className="weather-panel">
        <h2>Market Info</h2>
        <div className="weather-grid-two">
          <article className="weather-metric">
            <span>Orderbook</span>
            <strong>Best Bid {percent(data.meta?.orderbook?.bestBid ?? null)}</strong>
            <small>Best Ask {percent(data.meta?.orderbook?.bestAsk ?? null)}</small>
            <small>Mid {percent(data.meta?.orderbook?.mid ?? null)}</small>
            <small>Spread {percent(data.meta?.orderbook?.spread ?? null)}</small>
            <small>Spread (bps) {bps(data.meta?.orderbook?.spreadBps ?? null)}</small>
            <small>Min Tick {data.meta?.orderbook?.minTick ?? "-"}</small>
            <small>Min Size {data.meta?.orderbook?.minSize ?? "-"}</small>
            <small>Source {data.meta?.orderbook?.source || "-"}</small>
          </article>
          <article className="weather-metric">
            <span>Resolution Rules</span>
            <strong>{data.meta?.resolution?.source || "-"}</strong>
            <small>{truncate(data.meta?.resolution?.rules || "No rules provided.", 280)}</small>
          </article>
        </div>
        <div className="weather-grid-two">
          <article className="weather-metric">
            <span>Execution (Sample {data.meta?.orderbook?.execution?.sampleSize || 100} shares)</span>
            <strong>Buy Avg {percent(data.meta?.orderbook?.execution?.buyAvg ?? null)}</strong>
            <small>Buy Slippage {percent(data.meta?.orderbook?.execution?.buySlippage ?? null)}</small>
            <small>Buy Fill {percent(data.meta?.orderbook?.execution?.buyFillPct ?? null)}</small>
            <small>Sell Avg {percent(data.meta?.orderbook?.execution?.sellAvg ?? null)}</small>
            <small>Sell Slippage {percent(data.meta?.orderbook?.execution?.sellSlippage ?? null)}</small>
            <small>Sell Fill {percent(data.meta?.orderbook?.execution?.sellFillPct ?? null)}</small>
          </article>
          <article className="weather-metric">
            <span>Top-of-Book Depth (within 5c)</span>
            <strong>Bid Depth {num(data.meta?.orderbook?.depth5c?.bidSize ?? null)}</strong>
            <small>Ask Depth {num(data.meta?.orderbook?.depth5c?.askSize ?? null)}</small>
            <small>Token {truncate(data.meta?.orderbook?.tokenId || "-", 36)}</small>
            <small>Outcome {data.meta?.orderbook?.tokenLabel || "-"}</small>
          </article>
        </div>
        <OrderbookDepthChart
          bids={data.meta?.orderbook?.levels?.bids || []}
          asks={data.meta?.orderbook?.levels?.asks || []}
          bestBid={data.meta?.orderbook?.bestBid ?? null}
          bestAsk={data.meta?.orderbook?.bestAsk ?? null}
          unavailableReason={data.meta?.orderbook?.unavailableReason || null}
        />
        <div className="weather-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Top Holders</th>
                <th>Size</th>
                <th>Visible Share</th>
              </tr>
            </thead>
            <tbody>
              {data.meta?.holders?.rows?.map((row, index) => (
                <tr key={`${row.holder}-${index}`}>
                  <td>{shortAddress(row.holder)}</td>
                  <td>{row.size === null ? "-" : row.size.toLocaleString()}</td>
                  <td>{percent(row.pctOfVisible)}</td>
                </tr>
              ))}
              {!data.meta?.holders?.rows?.length ? (
                <tr>
                  <td colSpan={3}>
                    {data.meta?.holders?.message || "Top holders unavailable."}
                    {data.meta?.holders?.debug?.reason ? ` (reason: ${data.meta.holders.debug.reason})` : ""}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="weather-panel">
        <h2>Backtest</h2>
        <p>Historical analogs using prior saved analyses with matching schema and location.</p>
        {backtest ? (
          <>
            <BacktestChart
              points={backtest.rows.map((row) => ({
                time: new Date(row.created_at).getTime(),
                marketPrice: row.price,
                modelProb: row.p_model,
              }))}
            />
            <div className="weather-grid-two">
              <Metric label="Comparable Records" value={String(backtest.summary.total)} />
              <Metric label="PASS Rate" value={percent(backtest.summary.passRate)} />
              <Metric label="WATCH Rate" value={percent(backtest.summary.watchRate)} />
              <Metric label="Avg Edge" value={percent(backtest.summary.avgEdge)} />
              <Metric label="Avg EV Net" value={percent(backtest.summary.avgEvNet)} />
              <Metric label="Hypothetical EV Sum" value={percent(backtest.summary.hypotheticalReturn)} />
            </div>
            <div className="weather-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Event</th>
                    <th>Signal</th>
                    <th>Price</th>
                    <th>Model</th>
                    <th>Edge</th>
                    <th>EV Net</th>
                  </tr>
                </thead>
                <tbody>
                  {backtest.rows.slice(0, 12).map((row) => (
                    <tr key={row.id}>
                      <td>{fmtDate(row.created_at)}</td>
                      <td>{row.event_title}</td>
                      <td>{row.signal}</td>
                      <td>{percent(row.price)}</td>
                      <td>{percent(row.p_model)}</td>
                      <td>{percent(row.edge)}</td>
                      <td>{percent(row.ev_net)}</td>
                    </tr>
                  ))}
                  {backtest.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No comparable history yet. Run more analyses to build backtest data.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>Backtest data is loading or unavailable.</p>
        )}
      </section>

      <section className="weather-panel">
        <h2>How To Read This</h2>
        <ul>
          <li>If `Model Probability` is below `Market Price`, `Edge` is negative and trade is usually unattractive.</li>
          <li>`EV Net` is expected return after friction assumptions for the selected risk profile.</li>
          <li>`PASS` requires all gates true and positive EV; otherwise treat as `WATCH` or `NO_TRADE`.</li>
        </ul>
      </section>

      <section className="weather-panel">
        <h2>Snapshot Insights</h2>
        <ul>
          <li>
            Market spread: {pctFromSnapshot(data.market_snapshot?.bestBid)} bid vs{" "}
            {pctFromSnapshot(data.market_snapshot?.bestAsk)} ask.
          </li>
          <li>
            Market depth: volume {numFromSnapshot(data.market_snapshot?.volume)} and liquidity{" "}
            {numFromSnapshot(data.market_snapshot?.liquidity)}.
          </li>
          <li>
            Forecast source: Open-Meteo for {strFromSnapshot((data.forecast_snapshot?.geocode as any)?.name)} near{" "}
            {strFromSnapshot((data.forecast_snapshot?.forecast as any)?.timezone)} timezone.
          </li>
          <li>
            Practical use: compare Model vs Market line chart trend first, then inspect raw snapshots only when values
            look inconsistent.
          </li>
        </ul>
      </section>

      <section className="weather-panel">
        <h2>Raw Snapshots</h2>
        <div className="weather-grid-two">
          <article>
            <h3>Market Snapshot</h3>
            <pre>{JSON.stringify(data.market_snapshot, null, 2)}</pre>
          </article>
          <article>
            <h3>Forecast Snapshot</h3>
            <pre>{JSON.stringify(data.forecast_snapshot, null, 2)}</pre>
          </article>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="weather-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function percent(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function temp(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}F`;
}

function bps(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)} bps`;
}

function num(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString();
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function shortAddress(value: string) {
  if (!value) return "-";
  if (value.length < 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function renderReport(text: string) {
  const sections = parseReport(text);
  if (sections.length === 0) return <p>{text}</p>;

  return (
    <div className="weather-report-grid">
      {sections.map((section) => (
        <article key={section.title} className="weather-report-card">
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </article>
      ))}
    </div>
  );
}

function parseReport(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx <= 0) return null;
      const title = line.slice(0, idx).trim();
      const body = line.slice(idx + 1).trim();
      if (!title || !body) return null;
      return { title, body };
    })
    .filter((row): row is { title: string; body: string } => Boolean(row));

  if (parsed.length >= 2) return parsed;
  return [{ title: "Summary", body: text }];
}

function pctFromSnapshot(value: unknown) {
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

function numFromSnapshot(value: unknown) {
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString();
}

function strFromSnapshot(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  return "-";
}
