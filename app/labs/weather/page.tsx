"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LoadingStepper from "./components/LoadingStepper";
import BubbleMap from "./components/BubbleMap";

type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

type CandidateRow = {
  sourceMarketId: string;
  eventTitle: string;
  marketQuestion: string;
  price: number;
  liquidity: number;
  closeTime: string | null;
  eventUrl: string | null;
  imageUrl: string | null;
};

type StoredRow = {
  id: string;
  event_title: string;
  market_question: string;
  risk_profile: string;
  signal: string;
  status: string;
  price: number;
  liquidity: number;
  close_time: string | null;
  created_at: string;
};

type CandidateView = "cards" | "list" | "bubbles";

export default function WeatherLabsPage() {
  const router = useRouter();
  const [eventTitle, setEventTitle] = useState("");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("Balanced");
  const [rows, setRows] = useState<StoredRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [candidateView, setCandidateView] = useState<CandidateView>("cards");
  const [candidatePage, setCandidatePage] = useState(1);
  const [recentPage, setRecentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeLabel, setAnalyzeLabel] = useState("");
  const [status, setStatus] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pageSize = 10;

  useEffect(() => {
    void loadMarkets();
  }, []);

  useEffect(() => {
    if (!isAnalyzing) return;
    setStepIndex(0);
    const timer = window.setInterval(() => {
      setStepIndex((prev) => (prev >= 5 ? 5 : prev + 1));
    }, 650);
    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  const hasQuickInput = useMemo(() => Boolean(eventTitle.trim()), [eventTitle]);
  const pagedCandidates = useMemo(
    () => candidates.slice((candidatePage - 1) * pageSize, candidatePage * pageSize),
    [candidatePage, candidates]
  );
  const pagedRows = useMemo(() => rows.slice((recentPage - 1) * pageSize, recentPage * pageSize), [recentPage, rows]);
  const candidatePages = Math.max(1, Math.ceil(candidates.length / pageSize));
  const recentPages = Math.max(1, Math.ceil(rows.length / pageSize));

  async function loadMarkets(query?: string) {
    setIsLoading(true);
    setStatus("Loading market list...");
    const url = new URL("/api/weather/markets/list", window.location.origin);
    if (query?.trim()) {
      url.searchParams.set("q", query.trim());
    }

    const response = await fetch(url.toString());
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setStatus(data?.error || "Failed to load weather markets.");
      setIsLoading(false);
      return;
    }

    setRows(Array.isArray(data.rows) ? data.rows : []);
    setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
    setCandidatePage(1);
    setRecentPage(1);
    setStatus("");
    setIsLoading(false);
  }

  async function analyze(payload: { eventUrl?: string; eventTitle?: string }) {
    setAnalyzeLabel(payload.eventTitle || payload.eventUrl || "Selected market");
    setIsAnalyzing(true);
    setStatus("Analyzing weather market...");

    const response = await fetch("/api/weather/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, riskProfile }),
    });

    const data = await response.json().catch(() => ({}));
    setIsAnalyzing(false);

    if (!response.ok) {
      setStatus(data?.error || "Analyze failed.");
      return;
    }

    if (data?.id) {
      setStatus("Analysis complete.");
      router.push(`/labs/weather/markets/${data.id}`);
      return;
    }

    setStatus(data?.reason || "Analysis completed without a persisted record.");
    void loadMarkets(eventTitle);
  }

  async function deleteAnalysis(id: string) {
    if (deletingId) return;
    const ok = window.confirm("Delete this analysis from Recent Analyses?");
    if (!ok) return;

    setDeletingId(id);
    const response = await fetch(`/api/weather/markets/${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setDeletingId(null);

    if (!response.ok) {
      setStatus(data?.error || "Failed to delete analysis.");
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== id));
    setStatus("Analysis deleted.");
  }

  return (
    <main className="weather-page">
      <section className="weather-hero">
        <p className="weather-eyebrow">Labs</p>
        <h1>Weather Strategy Validation Tool</h1>
        <p>Validate Polymarket threshold temperature setups with forecast-driven probability and EV gates.</p>
      </section>

      <section className="weather-panel">
        <div className="weather-input-grid">
          <input
            value={eventTitle}
            onChange={(event) => setEventTitle(event.target.value)}
            placeholder="Event title"
          />
          <select value={riskProfile} onChange={(event) => setRiskProfile(event.target.value as RiskProfile)}>
            <option>Conservative</option>
            <option>Balanced</option>
            <option>Aggressive</option>
          </select>
          <button type="button" onClick={() => void loadMarkets(eventTitle)} disabled={isLoading}>
            Search
          </button>
          <button
            type="button"
            onClick={() => void analyze({ eventTitle: eventTitle || undefined })}
            disabled={!hasQuickInput || isAnalyzing}
            className="weather-primary-btn"
          >
            Analyze Quick Input
          </button>
        </div>

        {status ? <p className="weather-status">{status}</p> : null}
      </section>

      <section className="weather-panel">
        <div className="weather-section-head">
          <h2>Event Candidates</h2>
          <div className="weather-view-toggle" role="tablist" aria-label="Candidate display mode">
            <button
              type="button"
              className={candidateView === "cards" ? "is-active" : ""}
              onClick={() => setCandidateView("cards")}
            >
              Cards
            </button>
            <button
              type="button"
              className={candidateView === "list" ? "is-active" : ""}
              onClick={() => setCandidateView("list")}
            >
              List
            </button>
            <button
              type="button"
              className={candidateView === "bubbles" ? "is-active" : ""}
              onClick={() => setCandidateView("bubbles")}
            >
              Bubbles
            </button>
          </div>
        </div>
        {candidateView === "cards" ? (
          <div className="weather-candidate-cards">
            {pagedCandidates.map((row) => (
              <article className="weather-candidate-card" key={row.sourceMarketId}>
                <span className="weather-candidate-pill">Weather</span>
                <h3>{row.marketQuestion}</h3>
                <p>{row.eventTitle}</p>
                <div className="weather-candidate-meta">
                  <span>{pct(row.price)}</span>
                  <span>{usd(row.liquidity)}</span>
                  <span>{fmtDate(row.closeTime)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void analyze({ eventUrl: row.eventUrl || undefined, eventTitle: row.eventTitle })}
                  disabled={isAnalyzing}
                  className="weather-analyze-btn"
                >
                  Analyze
                </button>
              </article>
            ))}
            {candidates.length === 0 ? (
              <p className="weather-empty-note">No weather candidates found. Try a title search.</p>
            ) : null}
          </div>
        ) : null}

        {candidateView === "list" ? (
          <div className="weather-candidate-list">
            {pagedCandidates.map((row) => (
              <article className="weather-candidate-row" key={row.sourceMarketId}>
                <div>
                  <h3>{row.marketQuestion}</h3>
                  <p>
                    {row.eventTitle} · {fmtDate(row.closeTime)}
                  </p>
                </div>
                <div className="weather-candidate-row__right">
                  <strong>{pct(row.price)}</strong>
                  <span>{usd(row.liquidity)}</span>
                  <button
                    type="button"
                    onClick={() => void analyze({ eventUrl: row.eventUrl || undefined, eventTitle: row.eventTitle })}
                    disabled={isAnalyzing}
                    className="weather-analyze-btn"
                  >
                    Analyze
                  </button>
                </div>
              </article>
            ))}
            {candidates.length === 0 ? <p className="weather-empty-note">No weather candidates found.</p> : null}
          </div>
        ) : null}

        {candidateView === "bubbles" ? (
          <BubbleMap
            items={pagedCandidates}
            onAnalyze={(row) => void analyze({ eventUrl: row.eventUrl || undefined, eventTitle: row.eventTitle })}
            disabled={isAnalyzing}
          />
        ) : null}
        <div className="weather-pagination">
          <button
            type="button"
            onClick={() => setCandidatePage((p) => Math.max(1, p - 1))}
            disabled={candidatePage <= 1}
          >
            Prev
          </button>
          <span>
            Page {candidatePage} / {candidatePages}
          </span>
          <button
            type="button"
            onClick={() => setCandidatePage((p) => Math.min(candidatePages, p + 1))}
            disabled={candidatePage >= candidatePages}
          >
            Next
          </button>
        </div>
      </section>

      <section className="weather-panel">
        <div className="weather-section-head">
          <h2>Recent Analyses</h2>
        </div>
        <div className="weather-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Status</th>
                <th>Signal</th>
                <th>Risk</th>
                <th>Created</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.event_title}</td>
                  <td>{row.status}</td>
                  <td>{row.signal}</td>
                  <td>{row.risk_profile}</td>
                  <td>{fmtDate(row.created_at)}</td>
                  <td>
                    <div className="weather-action-group">
                      <Link href={`/labs/weather/markets/${row.id}`} className="weather-view-btn">
                        View
                      </Link>
                      <button
                        type="button"
                        className="weather-delete-btn"
                        onClick={() => void deleteAnalysis(row.id)}
                        disabled={deletingId === row.id}
                        aria-label="Delete analysis"
                        title="Delete analysis"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No saved analyses yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="weather-pagination">
          <button type="button" onClick={() => setRecentPage((p) => Math.max(1, p - 1))} disabled={recentPage <= 1}>
            Prev
          </button>
          <span>
            Page {recentPage} / {recentPages}
          </span>
          <button
            type="button"
            onClick={() => setRecentPage((p) => Math.min(recentPages, p + 1))}
            disabled={recentPage >= recentPages}
          >
            Next
          </button>
        </div>
      </section>

      {isAnalyzing ? (
        <div className="weather-modal-backdrop" role="dialog" aria-modal="true" aria-label="Analyzing weather market">
          <div className="weather-modal">
            <h3>Running Analysis</h3>
            <p>{analyzeLabel}</p>
            <LoadingStepper activeIndex={stepIndex} />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    value
  );
}
