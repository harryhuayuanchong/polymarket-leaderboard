"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = "https://data-api.polymarket.com";
const LABELS_API_BASE = "https://api.walletlabels.xyz/api";

const DETAILS_LIMIT = 20;
const DETAILS_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const SMART_MONEY_ALLOWLIST = new Set<string>([
  "0x0000000000000000000000000000000000000000",
].map((address) => address.toLowerCase()));

const VERIFIED_ALLOWLIST = new Set<string>([]);

const SMART_MONEY_KEYWORDS = [
  "market maker",
  "mm",
  "fund",
  "capital",
  "hedge",
  "prop",
  "proprietary",
  "trading",
  "trader",
  "arbitrage",
  "quant",
  "whale",
  "treasury",
  "dao",
  "vc",
  "venture",
];

type LeaderboardRow = {
  rank: number | null;
  name: string | null;
  address: string | null;
  pnl: number;
  volume: number;
  event: string | null;
  positionsCount: number | null;
  positionsValue: number | null;
  isSmartMoney: boolean;
  isVerified: boolean;
  labels: any[];
};

type SortState = {
  key: "pnl" | "volume";
  direction: "asc" | "desc";
};

type CacheEntry<T> = {
  value: T;
  timestamp: number;
};

function shortAddress(address?: string | null) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeUsername(name: string | null, address: string | null) {
  if (!name) return shortAddress(address);
  const normalized = name.trim();
  const match = normalized.match(/^(0x[a-fA-F0-9]{40})(?:-.+)?$/);
  if (match) {
    return shortAddress(match[1]);
  }
  return normalized;
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateValue: any) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toTimestamp(value: any) {
  const time = new Date(value || 0).getTime();
  if (!Number.isNaN(time) && time > 0) return time;
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric <= 0) return 0;
  return numeric < 1e12 ? numeric * 1000 : numeric;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export default function Home() {
  const [category, setCategory] = useState("OVERALL");
  const [timePeriod, setTimePeriod] = useState("DAY");
  const [limit] = useState(50);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Loading...");
  const [isLoading, setIsLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [sortState, setSortState] = useState<SortState>({ key: "pnl", direction: "desc" });
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [modalOpen, setModalOpen] = useState(false);
  const [activeModalAddress, setActiveModalAddress] = useState<string | null>(null);
  const [tracked, setTracked] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"leaderboard" | "watchlist">("leaderboard");
  const [modalData, setModalData] = useState({
    name: "Wallet",
    joined: "Joined —",
    addressShort: "0x…",
    lifetimePnl: "—",
    lifetimeVol: "—",
    lifetimePnlNeg: false,
    positionsCount: "—",
    positionsValue: "—",
    tradesCount: "—",
    tradeSummary: "Loading...",
    positionSummary: "Loading...",
    positionsHtml: "Loading...",
    historyHtml: "Loading...",
    chartHtml: "<div class=\"chart-empty\">Loading...</div>",
    chartValue: "$0.00",
  });
  const [modalRaw, setModalRaw] = useState<{ positions: any[]; activity: any[] }>({
    positions: [],
    activity: [],
  });

  const labelCache = useRef<Map<string, CacheEntry<any[]>>>(new Map());
  const eventCache = useRef<Map<string, CacheEntry<string | null>>>(new Map());
  const positionsCache = useRef<Map<string, CacheEntry<any[]>>>(new Map());
  const profileCache = useRef<Map<string, CacheEntry<any>>>(new Map());
  const valueCache = useRef<Map<string, CacheEntry<any>>>(new Map());
  const activityCache = useRef<Map<string, CacheEntry<any[]>>>(new Map());
  const closedPositionsCache = useRef<Map<string, CacheEntry<any[]>>>(new Map());
  const loadSequence = useRef(0);
  const debounceTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const activeModalRef = useRef<string | null>(null);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return leaderboard;
    return leaderboard.filter((row) => {
      const name = row.name ? row.name.toLowerCase() : "";
      const address = row.address ? row.address.toLowerCase() : "";
      return name.includes(query) || address.includes(query);
    });
  }, [leaderboard, search]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    const factor = sortState.direction === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const valueA = a[sortState.key] ?? 0;
      const valueB = b[sortState.key] ?? 0;
      return (valueA - valueB) * factor;
    });
    return rows;
  }, [filteredRows, sortState]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1500);
  }

  function updateStatus(message: string, loading = false) {
    setStatus(message);
    setIsLoading(loading);
  }

  async function fetchLeaderboard() {
    const url = new URL(`${API_BASE}/v1/leaderboard`);
    url.searchParams.set("category", category);
    url.searchParams.set("timePeriod", timePeriod);
    url.searchParams.set("limit", String(limit));

    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`);
    return response.json();
  }

  async function fetchLabels(address: string, apiKey: string) {
    if (!address || !apiKey) return [] as any[];
    const normalized = address.toLowerCase();
    const cached = labelCache.current.get(normalized);
    if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) return cached.value;

    const url = new URL(`${LABELS_API_BASE}/ethereum/label/${normalized}`);
    url.searchParams.set("apikey", apiKey);

    const response = await fetchWithTimeout(url.toString()).catch(() => null);
    if (!response || !response.ok) {
      labelCache.current.set(normalized, { value: [], timestamp: Date.now() });
      return [];
    }

    const payload = await response.json();
    const labels = Array.isArray(payload?.data) ? payload.data : [];
    labelCache.current.set(normalized, { value: labels, timestamp: Date.now() });
    return labels;
  }

  async function fetchLastEvent(address: string) {
    if (!address) return null;
    const normalized = address.toLowerCase();
    const cached = eventCache.current.get(normalized);
    if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) return cached.value;

    const url = new URL(`${API_BASE}/activity`);
    url.searchParams.set("user", address);
    url.searchParams.set("limit", "1");
    url.searchParams.set("sortBy", "TIMESTAMP");
    url.searchParams.set("sortDirection", "DESC");

    const response = await fetchWithTimeout(url.toString()).catch(() => null);
    if (!response || !response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const activity = data[0];
    const title = activity?.title || activity?.name || activity?.eventTitle || activity?.eventSlug || null;
    eventCache.current.set(normalized, { value: title, timestamp: Date.now() });
    return title;
  }

  async function fetchPositions(address: string) {
    if (!address) return [] as any[];
    const normalized = address.toLowerCase();
    const cached = positionsCache.current.get(normalized);
    if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) return cached.value;

    const url = new URL(`${API_BASE}/positions`);
    url.searchParams.set("user", address);
    url.searchParams.set("limit", "100");
    url.searchParams.set("sizeThreshold", "1");

    const response = await fetchWithTimeout(url.toString()).catch(() => null);
    if (!response || !response.ok) return [];
    const data = await response.json();
    const positions = Array.isArray(data) ? data : [];
    positionsCache.current.set(normalized, { value: positions, timestamp: Date.now() });
    return positions;
  }

  async function fetchProfile(address: string) {
    if (!address) return null;
    const normalized = address.toLowerCase();
    const cached = profileCache.current.get(normalized);
    if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) return cached.value;

    const url = new URL("/api/public-profile", window.location.origin);
    url.searchParams.set("address", address);

    const response = await fetchWithTimeout(url.toString()).catch(() => null);
    if (!response || !response.ok) return null;
    const data = await response.json();
    profileCache.current.set(normalized, { value: data, timestamp: Date.now() });
    return data;
  }

  async function fetchValue(address: string) {
    if (!address) return null;
    const normalized = address.toLowerCase();
    const cached = valueCache.current.get(normalized);
    if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) return cached.value;

    const url = new URL(`${API_BASE}/value`);
    url.searchParams.set("user", address);

    const response = await fetchWithTimeout(url.toString()).catch(() => null);
    if (!response || !response.ok) return null;
    const data = await response.json();
    const entry = Array.isArray(data) ? data[0] : data;
    valueCache.current.set(normalized, { value: entry, timestamp: Date.now() });
    return entry;
  }

  async function fetchActivity(address: string, limitValue = 200) {
    if (!address) return [] as any[];
    const normalized = address.toLowerCase();
    const cached = activityCache.current.get(normalized);
    if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) return cached.value;

    const url = new URL(`${API_BASE}/activity`);
    url.searchParams.set("user", address);
    url.searchParams.set("limit", String(limitValue));
    url.searchParams.set("sortBy", "TIMESTAMP");
    url.searchParams.set("sortDirection", "DESC");

    const response = await fetchWithTimeout(url.toString()).catch(() => null);
    if (!response || !response.ok) return [];
    const data = await response.json();
    const activity = Array.isArray(data) ? data : [];
    activityCache.current.set(normalized, { value: activity, timestamp: Date.now() });
    return activity;
  }

  async function fetchClosedPositions(address: string) {
    if (!address) return [] as any[];
    const normalized = address.toLowerCase();
    const cached = closedPositionsCache.current.get(normalized);
    if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) return cached.value;

    const url = new URL(`${API_BASE}/closed-positions`);
    url.searchParams.set("user", address);
    url.searchParams.set("limit", "50");
    url.searchParams.set("sortBy", "TIMESTAMP");
    url.searchParams.set("sortDirection", "ASC");

    const response = await fetchWithTimeout(url.toString()).catch(() => null);
    if (!response || !response.ok) return [];
    const data = await response.json();
    const positions = Array.isArray(data) ? data : [];
    closedPositionsCache.current.set(normalized, { value: positions, timestamp: Date.now() });
    return positions;
  }

  function summarizeLabels(labels: any[]) {
    const labelText = labels
      .map((label) =>
        [label.address_name, label.label, label.label_type, label.label_subtype]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
      )
      .join(" ");
    return SMART_MONEY_KEYWORDS.some((keyword) => labelText.includes(keyword));
  }

  function classifySmartMoney(row: LeaderboardRow, labels: any[]) {
    const labelMatch = summarizeLabels(labels);
    const volume = row.volume || 0;
    const pnl = row.pnl || 0;
    const pnlToVolume = volume > 0 ? pnl / volume : 0;
    const strongPnlRule = pnl >= 5000 && volume >= 10000 && pnlToVolume >= 0.1;
    const topRankRule = row.rank !== null && row.rank <= 5 && pnl > 0;
    return labelMatch || strongPnlRule || topRankRule;
  }

  function renderPositionsList(positions: any[]) {
    if (!positions || positions.length === 0) {
      return '<div class="chart-empty">No open positions.</div>';
    }

    return positions
      .slice(0, 6)
      .map((position: any) => {
        const title = position?.title || "Unknown market";
        const outcome = position?.outcome || position?.token?.outcome || "—";
        const value = Number(position?.currentValue ?? position?.value ?? 0);
        const pnl = Number(position?.cashPnl ?? position?.pnl ?? 0);
        const pnlClass = pnl >= 0 ? "pnl-pos" : "pnl-neg";
        return `
          <div class="panel-item">
            <strong>${title}</strong>
            <div class="meta">
              <span>Outcome: ${outcome}</span>
              <span class="chip ${pnlClass}">PNL ${formatCurrency(pnl)}</span>
            </div>
            <div>Value: ${formatCurrency(value)}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderHistoryList(activity: any[]) {
    if (!activity || activity.length === 0) {
      return '<div class="chart-empty">No recent trades.</div>';
    }

    return activity
      .slice(0, 10)
      .map((item: any) => {
        const title = item?.title || item?.name || item?.eventTitle || "Unknown market";
        const side = item?.side || item?.direction || item?.type || "—";
        const size = Number(item?.usdcSize ?? item?.size ?? 0);
        const time = formatDate(item?.timestamp || item?.createdAt);
        const sideClass = side.toUpperCase() === "BUY" ? "buy" : "sell";
        return `
          <div class="panel-item">
            <strong>${title}</strong>
            <div class="meta">
              <span class="chip ${sideClass}">${side}</span>
              <span>${formatCurrency(size)}</span>
            </div>
            <div class="meta">${time}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderTradeSummary(activity: any[]) {
    if (!activity || activity.length === 0) {
      return '<div class="chart-empty">No recent trades.</div>';
    }
    const trades = activity.filter((item: any) => item?.type === "TRADE");
    const buys = trades.filter((item: any) => item?.side === "BUY").length;
    const sells = trades.filter((item: any) => item?.side === "SELL").length;
    const volume = trades.reduce((sum: number, item: any) => sum + Number(item?.usdcSize ?? 0), 0);

    return `
      <div class="panel-item"><strong>Trades</strong> ${trades.length}</div>
      <div class="panel-item"><strong>Buys</strong> ${buys}</div>
      <div class="panel-item"><strong>Sells</strong> ${sells}</div>
      <div class="panel-item"><strong>Volume</strong> ${formatCurrency(volume)}</div>
    `;
  }

  function renderPositionSummary(positions: any[], positionsValue: number) {
    if (!positions || positions.length === 0) {
      return '<div class="chart-empty">No open positions.</div>';
    }
    const top = [...positions].sort((a, b) => {
      const aValue = Number(a?.currentValue ?? a?.value ?? 0);
      const bValue = Number(b?.currentValue ?? b?.value ?? 0);
      return bValue - aValue;
    })[0];

    const topTitle = top?.title || "Unknown market";
    const topValue = Number(top?.currentValue ?? top?.value ?? 0);

    return `
      <div class="panel-item"><strong>Open Positions</strong> ${positions.length}</div>
      <div class="panel-item"><strong>Total Value</strong> ${formatCurrency(positionsValue)}</div>
      <div class="panel-item"><strong>Largest Position</strong> ${topTitle}</div>
      <div class="panel-item"><strong>Largest Value</strong> ${formatCurrency(topValue)}</div>
    `;
  }

  function renderPnlChart(positions: any[]) {
    if (!positions || positions.length === 0) {
      setModalData((prev) => ({
        ...prev,
        chartHtml: '<div class="chart-empty">No closed positions yet.</div>',
        chartValue: "$0.00",
      }));
      return;
    }

    const series = positions
      .map((item: any) => ({
        timestamp: toTimestamp(item?.timestamp || item?.closedAt || item?.closedTimestamp),
        pnl: Number(item?.realizedPnl ?? item?.pnl ?? 0),
      }))
      .filter((item: any) => !Number.isNaN(item.timestamp))
      .sort((a: any, b: any) => a.timestamp - b.timestamp);

    if (series.length === 0) {
      setModalData((prev) => ({
        ...prev,
        chartHtml: '<div class="chart-empty">No closed positions yet.</div>',
        chartValue: "$0.00",
      }));
      return;
    }

    let cumulative = 0;
    const points = series.map((point) => {
      cumulative += point.pnl;
      return { x: point.timestamp, y: cumulative };
    });

    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const rangeY = maxY - minY || 1;
    const minX = points[0].x;
    const maxX = points[points.length - 1].x;
    const rangeX = maxX - minX || 1;

    const width = 600;
    const height = 260;
    const padding = 18;

    const plotPoints = points.map((point) => {
      const x = padding + ((point.x - minX) / rangeX) * (width - padding * 2);
      const y = padding + (1 - (point.y - minY) / rangeY) * (height - padding * 2);
      return { ...point, sx: x, sy: y };
    });

    const polyline = plotPoints.map((point) => `${point.sx},${point.sy}`).join(" ");

    const chartHtml = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" data-chart>
        <polyline
          fill="none"
          stroke="#5df2b2"
          stroke-width="2.5"
          points="${polyline}"
        />
      </svg>
      <div class="chart-tooltip" id="chartTooltip" style="display:none;"></div>
    `;

    setModalData((prev) => ({
      ...prev,
      chartHtml,
      chartValue: formatCurrency(points[points.length - 1]?.y ?? 0),
    }));

    window.requestAnimationFrame(() => {
      const tooltip = document.getElementById("chartTooltip");
      const svg = document.querySelector("[data-chart]") as SVGSVGElement | null;
      if (!tooltip || !svg) return;

      svg.onmousemove = (event) => {
        const rect = svg.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * width;
        let closest = plotPoints[0];
        let minDist = Math.abs(closest.sx - x);
        for (const point of plotPoints) {
          const dist = Math.abs(point.sx - x);
          if (dist < minDist) {
            minDist = dist;
            closest = point;
          }
        }
        const date = new Date(closest.x).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        tooltip.style.display = "block";
        tooltip.style.left = `${(closest.sx / width) * 100}%`;
        tooltip.style.top = `${(closest.sy / height) * 100}%`;
        tooltip.textContent = `${date} · ${formatCurrency(closest.y)}`;
      };

      svg.onmouseleave = () => {
        tooltip.style.display = "none";
      };
    });
  }

  async function openModal(row: LeaderboardRow) {
    if (!row.address) return;
    setActiveModalAddress(row.address);
    activeModalRef.current = row.address;
    setModalOpen(true);
    setModalData((prev) => ({
      ...prev,
      name: row.name || shortAddress(row.address),
      joined: "Joined —",
      addressShort: shortAddress(row.address),
      lifetimePnl: "—",
      lifetimeVol: "—",
      lifetimePnlNeg: false,
      positionsCount: "—",
      positionsValue: "—",
      tradesCount: "—",
      tradeSummary: "Loading...",
      positionSummary: "Loading...",
      positionsHtml: "Loading...",
      historyHtml: "Loading...",
      chartHtml: '<div class="chart-empty">Loading...</div>',
      chartValue: "$0.00",
    }));
    setModalRaw({ positions: [], activity: [] });

    const results = await Promise.allSettled([
      fetchProfile(row.address),
      fetchValue(row.address),
      fetchPositions(row.address),
      fetchActivity(row.address, 200),
      fetchClosedPositions(row.address),
    ]);

    if (activeModalRef.current !== row.address) return;

    const profile = results[0].status === "fulfilled" ? results[0].value : null;
    const value = results[1].status === "fulfilled" ? results[1].value : null;
    const positions = results[2].status === "fulfilled" ? results[2].value : [];
    const activity = results[3].status === "fulfilled" ? results[3].value : [];
    const closedPositions = results[4].status === "fulfilled" ? results[4].value : [];

    const profileName =
      profile?.name || profile?.username || profile?.displayName || row.name || shortAddress(row.address);
    const joined = profile?.createdAt || profile?.created_at || profile?.created;

    const positionsValue =
      Number(value?.totalValue ?? value?.value ?? value?.portfolioValue ?? 0) ||
      positions.reduce((sum: number, item: any) => sum + Number(item?.currentValue ?? item?.value ?? 0), 0);

    const trades = activity.filter((item: any) => item?.type === "TRADE");
    const volume = trades.reduce((sum: number, item: any) => sum + Number(item?.usdcSize ?? 0), 0);

    const realized = closedPositions.reduce(
      (sum: number, item: any) => sum + Number(item?.realizedPnl ?? item?.pnl ?? 0),
      0
    );

    setModalData((prev) => ({
      ...prev,
      name: profileName,
      joined: joined ? `Joined ${formatDate(joined)}` : "Joined —",
      addressShort: shortAddress(row.address),
      lifetimePnl: formatCurrency(realized),
      lifetimeVol: formatCurrency(volume),
      lifetimePnlNeg: realized < 0,
      positionsCount: positions.length.toString(),
      positionsValue: formatCurrency(positionsValue),
      tradesCount: trades.length.toString(),
      tradeSummary: renderTradeSummary(activity),
      positionSummary: renderPositionSummary(positions, positionsValue),
      positionsHtml: renderPositionsList(positions),
      historyHtml: renderHistoryList(activity),
    }));
    setModalRaw({ positions, activity });

    renderPnlChart(closedPositions);
  }

  function closeModal() {
    setModalOpen(false);
    setActiveModalAddress(null);
    activeModalRef.current = null;
  }

  async function loadLeaderboard() {
    const currentLoad = ++loadSequence.current;
    updateStatus("Loading leaderboard...", true);

    try {
      const data = await fetchLeaderboard();
      if (currentLoad !== loadSequence.current) return;

      let mapped: LeaderboardRow[] = data.map((entry: any, index: number) => {
        const address = entry.proxyWallet || entry.address || entry.userAddress || entry.user;
        const normalized = address ? address.toLowerCase() : null;
        return {
          rank: entry.rank ?? index + 1,
          name: entry.userName || entry.name || null,
          address,
          pnl: Number(entry.pnl) || 0,
          volume: Number(entry.vol) || 0,
          event: null,
          positionsCount: null,
          positionsValue: null,
          isSmartMoney: normalized ? SMART_MONEY_ALLOWLIST.has(normalized) : false,
          isVerified: entry.verifiedBadge === true || (normalized ? VERIFIED_ALLOWLIST.has(normalized) : false),
          labels: [],
        };
      });

      const apiKey = localStorage.getItem("walletLabelsApiKey") || "";
      if (apiKey) {
        updateStatus("Fetching wallet labels...", true);
        await Promise.all(
          mapped.map(async (row) => {
            if (!row.address) return row;
            row.labels = await fetchLabels(row.address, apiKey);
            if (!row.isSmartMoney) {
              row.isSmartMoney = classifySmartMoney(row, row.labels);
            }
            return row;
          })
        );
      }

      const detailRows = mapped.slice(0, DETAILS_LIMIT);
      updateStatus(`Fetching last event for top ${DETAILS_LIMIT}...`, true);
      await Promise.all(
        detailRows.map(async (row) => {
          if (row.address) {
            row.event = await fetchLastEvent(row.address);
          }
          return row;
        })
      );

      if (currentLoad !== loadSequence.current) return;

      updateStatus(`Fetching positions for top ${DETAILS_LIMIT}...`, true);
      await Promise.all(
        detailRows.map(async (row) => {
          if (row.address) {
            const positions = await fetchPositions(row.address);
            row.positionsCount = positions.length;
            row.positionsValue = positions.reduce((sum: number, position: any) => {
              const value = Number(position?.currentValue ?? position?.value ?? 0);
              return sum + (Number.isNaN(value) ? 0 : value);
            }, 0);
          }
          return row;
        })
      );

      if (currentLoad !== loadSequence.current) return;

      setLeaderboard(mapped);
      updateStatus(`Loaded ${mapped.length} rows.`, false);
    } catch (error) {
      console.error(error);
      updateStatus("Unable to load leaderboard. Check console for details.", false);
    }
  }

  useEffect(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      loadLeaderboard();
    }, 200);
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [category, timePeriod, limit]);

  useEffect(() => {
    const stored = window.localStorage.getItem("trackedWallets");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setTracked(parsed);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("trackedWallets", JSON.stringify(tracked));
  }, [tracked]);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      document.body.dataset.theme = stored;
    } else {
      document.body.dataset.theme = "light";
    }
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.body.dataset.theme = nextTheme;
    window.localStorage.setItem("theme", nextTheme);
  }

  function isTracked(address: string | null) {
    if (!address) return false;
    return tracked.includes(address.toLowerCase());
  }

  function toggleTrack(address: string | null) {
    if (!address) return;
    const normalized = address.toLowerCase();
    setTracked((prev) => {
      if (prev.includes(normalized)) {
        return prev.filter((item) => item !== normalized);
      }
      return [...prev, normalized];
    });
  }

  function exportCsv(rows: any[][], headers: string[], filename: string) {
    const lines = [headers.join(",")];
    rows.forEach((row) => {
      const line = row.map((value) => {
        if (value === null || value === undefined) return "";
        const text = String(value);
        if (/[",\n]/.test(text)) {
          return `"${text.replace(/"/g, "\"\"")}"`;
        }
        return text;
      });
      lines.push(line.join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `${filename}-${date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function exportLeaderboardCsv() {
    const headers = ["Rank", "Name", "Address", "Event", "Positions Value", "PNL", "Volume"];
    const rows = filteredRows.map((row) => [
      row.rank ?? "",
      row.name ?? "",
      row.address ?? "",
      row.event ?? "",
      row.positionsValue ?? "",
      row.pnl ?? "",
      row.volume ?? "",
    ]);
    exportCsv(rows, headers, "polymarket-leaderboard");
  }

  function exportPositionsCsv() {
    const headers = ["Title", "Outcome", "Market", "Current Value", "PNL", "Shares"];
    const rows = modalRaw.positions.map((position) => [
      position?.title || "",
      position?.outcome || position?.token?.outcome || "",
      position?.market?.question || "",
      position?.currentValue ?? position?.value ?? "",
      position?.cashPnl ?? position?.pnl ?? "",
      position?.shares ?? position?.size ?? "",
    ]);
    exportCsv(rows, headers, "positions");
  }

  function exportHistoryCsv() {
    const headers = ["Title", "Side", "USDC Size", "Timestamp", "Status", "Market"];
    const rows = modalRaw.activity.map((item) => [
      item?.title || item?.name || item?.eventTitle || "",
      item?.side || item?.direction || item?.type || "",
      item?.usdcSize ?? item?.size ?? "",
      item?.timestamp || item?.createdAt || "",
      item?.status || "",
      item?.market || "",
    ]);
    exportCsv(rows, headers, "trading-history");
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Polymarket Leaderboard</p>
          <h1>Top Traders & Biggest Wins</h1>
          <p className="subhead">
            Pulls live leaderboard data from Polymarket’s Data API.
          </p>
        </div>
        <div className="hero-card">
          <div className="hero-stat">
            <span className="label">Category</span>
            <span className="value">{category}</span>
          </div>
          <div className="hero-stat">
            <span className="label">Time Period</span>
            <span className="value">{timePeriod}</span>
          </div>
          <div className="hero-stat">
            <span className="label">Results</span>
            <span className="value">{leaderboard.length}</span>
          </div>
          <button className="pill-button theme-toggle" onClick={toggleTheme}>
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === "leaderboard" ? "active" : ""}`}
          onClick={() => setActiveTab("leaderboard")}
        >
          Leaderboard
        </button>
        <button
          className={`tab-btn ${activeTab === "watchlist" ? "active" : ""}`}
          onClick={() => setActiveTab("watchlist")}
        >
          Watchlist
        </button>
      </div>

      {activeTab === "leaderboard" ? (
      <section className="controls">
        <div className="search">
          <span className="search-icon">⌕</span>
          <input
            id="search"
            type="search"
            placeholder="Search by address or name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="filters">
          <select className="pill" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="OVERALL">Overall</option>
            <option value="POLITICS">Politics</option>
            <option value="SPORTS">Sports</option>
            <option value="CRYPTO">Crypto</option>
            <option value="CULTURE">Culture</option>
            <option value="MENTIONS">Mentions</option>
            <option value="WEATHER">Weather</option>
            <option value="ECONOMICS">Economics</option>
            <option value="TECH">Tech</option>
            <option value="FINANCE">Finance</option>
          </select>
          <select className="pill" value={timePeriod} onChange={(event) => setTimePeriod(event.target.value)}>
            <option value="DAY">1 Day</option>
            <option value="WEEK">7 Days</option>
            <option value="MONTH">1 Month</option>
            <option value="ALL">All Time</option>
          </select>
          <select className="pill" value={limit} disabled>
            <option value="50">50</option>
          </select>
          <button className="pill-button" onClick={exportLeaderboardCsv}>
            Export CSV
          </button>
          <button className="pill-button icon-button" aria-label="Refresh" onClick={loadLeaderboard}>
            <span className="icon">↻</span>
          </button>
        </div>
      </section>
      ) : null}

      {activeTab === "leaderboard" ? (
      <section className="table-wrap">
        <div className="table-header">
          <h2>Leaderboard</h2>
        </div>
        <div className={`status ${isLoading ? "loading" : ""}`}>{status}</div>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Username</th>
              <th>Event (Last Trade)</th>
              <th>Positions</th>
              <th
                className={`sortable ${sortState.key === "pnl" ? `sorted-${sortState.direction}` : ""}`}
                onClick={() =>
                  setSortState((prev) => ({
                    key: "pnl",
                    direction: prev.key === "pnl" && prev.direction === "desc" ? "asc" : "desc",
                  }))
                }
              >
                PNL
              </th>
              <th
                className={`sortable ${sortState.key === "volume" ? `sorted-${sortState.direction}` : ""}`}
                onClick={() =>
                  setSortState((prev) => ({
                    key: "volume",
                    direction: prev.key === "volume" && prev.direction === "desc" ? "asc" : "desc",
                  }))
                }
              >
                Volume
              </th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const pnlClass = row.pnl >= 0 ? "positive" : "negative";
              const trackedActive = isTracked(row.address);
              return (
                <tr key={row.address ?? row.rank ?? Math.random()}>
                  <td>{row.rank ?? "—"}</td>
                  <td>
                    <button className="address-link" onClick={() => row.address && openModal(row)}>
                      <span className="username-pill">{normalizeUsername(row.name, row.address)}</span>
                      <span className="view-icon" title="View wallet details">↗</span>
                    </button>
                    <div className="address">
                      <span>{shortAddress(row.address)}</span>
                      {row.address ? (
                        <button
                          className="copy-btn-table"
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(row.address || "");
                            showToast("Address copied");
                          }}
                        >
                          ⧉
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td>{row.event || "—"}</td>
                  <td>
                    {row.positionsCount === null ? (
                      "—"
                    ) : (
                      <span className="positions-value">{formatCurrency(row.positionsValue)}</span>
                    )}
                  </td>
                  <td className={`pnl ${pnlClass}`}>{formatCurrency(row.pnl)}</td>
                  <td>{formatCurrency(row.volume)}</td>
                  <td>
                    <button
                      className={`star-btn ${trackedActive ? "active" : ""}`}
                      onClick={() => toggleTrack(row.address)}
                    >
                      {trackedActive ? "★" : "☆"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      ) : null}

      {toast ? <div className="toast show">{toast}</div> : null}

      {modalOpen ? (
        <div className="modal-overlay" onClick={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}>
          <div className="modal">
            <button className="modal-close" aria-label="Close" onClick={closeModal}>
              ×
            </button>
            <div className="modal-header">
              <div className="profile">
                <div className="avatar">{modalData.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className="profile-name">{modalData.name}</div>
                  <div className="profile-sub">
                    <span>{modalData.joined}</span>
                    <span className="dot">•</span>
                    <button
                      className="copy-btn"
                      type="button"
                      onClick={async () => {
                        if (!activeModalAddress) return;
                        await navigator.clipboard.writeText(activeModalAddress);
                        showToast("Address copied");
                      }}
                    >
                      <span>{modalData.addressShort}</span>
                      <span className="copy-icon">⧉</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-metrics">
              <div className="metric-card">
                <span>Lifetime PNL</span>
                <strong className={modalData.lifetimePnlNeg ? "neg" : ""}>{modalData.lifetimePnl}</strong>
                <small>Based on closed positions</small>
              </div>
              <div className="metric-card">
                <span>Lifetime Volume</span>
                <strong>{modalData.lifetimeVol}</strong>
                <small>Based on recent activity</small>
              </div>
              <div className="metric-card">
                <span>Open Positions</span>
                <strong>{modalData.positionsCount}</strong>
                <small>Total value: {modalData.positionsValue}</small>
              </div>
              <div className="metric-card">
                <span>Trades (Recent)</span>
                <strong>{modalData.tradesCount}</strong>
                <small>Last 200 trades</small>
              </div>
            </div>

            <section className="modal-panel modal-chart-panel">
              <div className="panel-header">
                <div className="chart-title">
                  <span>PNL</span>
                  <small>All time</small>
                </div>
              </div>
              <div className="chart-value">{modalData.chartValue}</div>
              <div className="chart chart-large" dangerouslySetInnerHTML={{ __html: modalData.chartHtml }} />
            </section>

            <div className="modal-grid">
              <section className="modal-panel">
                <header>Trade Summary</header>
                <div className="panel-list" dangerouslySetInnerHTML={{ __html: modalData.tradeSummary }} />
              </section>

              <section className="modal-panel">
                <header>Position Summary</header>
                <div className="panel-list" dangerouslySetInnerHTML={{ __html: modalData.positionSummary }} />
              </section>

              <section className="modal-panel">
                <div className="panel-header">
                  <header>Position Details</header>
                  <button className="panel-btn" type="button" onClick={exportPositionsCsv}>
                    Export CSV
                  </button>
                </div>
                <div className="panel-list" dangerouslySetInnerHTML={{ __html: modalData.positionsHtml }} />
              </section>

              <section className="modal-panel">
                <div className="panel-header">
                  <header>Trading History</header>
                  <button className="panel-btn" type="button" onClick={exportHistoryCsv}>
                    Export CSV
                  </button>
                </div>
                <div className="panel-list" dangerouslySetInnerHTML={{ __html: modalData.historyHtml }} />
              </section>
            </div>

            <div className="modal-footer">
              <a
                className="pill-button"
                href={activeModalAddress ? `https://polymarket.com/profile/${activeModalAddress}` : "#"}
                target="_blank"
                rel="noreferrer"
              >
                View Full Profile
              </a>
              <button
                className="pill-button"
                type="button"
                onClick={() => toggleTrack(activeModalAddress)}
              >
                {isTracked(activeModalAddress) ? "Untrack Wallet" : "Track Wallet"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "watchlist" ? (
        <section className="table-wrap tracked-wrap">
          <div className="table-header">
            <h2>Watchlist</h2>
          </div>
          {tracked.length === 0 ? (
            <div className="status">No tracked wallets yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Username</th>
                  <th>Event (Last Trade)</th>
                  <th>Positions</th>
                  <th className="sortable">PNL</th>
                  <th className="sortable">Volume</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {tracked.map((address) => {
                  const row = leaderboard.find((item) => item.address?.toLowerCase() === address);
                  if (!row) {
                    return (
                      <tr key={address}>
                        <td>—</td>
                        <td>
                          <span className="username-pill">{shortAddress(address)}</span>
                          <div className="address">{shortAddress(address)}</div>
                        </td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>
                          <button className="star-btn active" onClick={() => toggleTrack(address)}>
                            ★
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  const pnlClass = row.pnl >= 0 ? "positive" : "negative";
                  return (
                    <tr key={address}>
                      <td>{row.rank ?? "—"}</td>
                      <td>
                        <button className="address-link" onClick={() => row.address && openModal(row)}>
                          <span className="username-pill">
                            {normalizeUsername(row.name, row.address)}
                          </span>
                          <span className="view-icon" title="View wallet details">↗</span>
                        </button>
                        <div className="address">
                          <span>{shortAddress(row.address)}</span>
                          {row.address ? (
                            <button
                              className="copy-btn-table"
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(row.address || "");
                                showToast("Address copied");
                              }}
                            >
                              ⧉
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td>{row.event || "—"}</td>
                      <td>
                        {row.positionsCount === null ? (
                          "—"
                        ) : (
                          <span className="positions-value">{formatCurrency(row.positionsValue)}</span>
                        )}
                      </td>
                      <td className={`pnl ${pnlClass}`}>{formatCurrency(row.pnl)}</td>
                      <td>{formatCurrency(row.volume)}</td>
                      <td>
                        <button className="star-btn active" onClick={() => toggleTrack(row.address)}>
                          ★
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      <footer className="footer">
        <p>
          Data source: Polymarket Data API. Sorting is client-side for PNL and Volume. Smart Money
          classification combines performance rules and optional WalletLabels signals configured in
          code.
        </p>
      </footer>
    </div>
  );
}
