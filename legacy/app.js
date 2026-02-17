const API_BASE = "https://data-api.polymarket.com";
const LABELS_API_BASE = "https://api.walletlabels.xyz/api";

const elements = {
  category: document.getElementById("category"),
  timePeriod: document.getElementById("timePeriod"),
  limit: document.getElementById("limit"),
  search: document.getElementById("search"),
  exportCsv: document.getElementById("exportCsv"),
  refresh: document.getElementById("refresh"),
  status: document.getElementById("status"),
  rows: document.getElementById("rows"),
  toast: document.getElementById("toast"),
  statCategory: document.getElementById("statCategory"),
  statPeriod: document.getElementById("statPeriod"),
  statCount: document.getElementById("statCount"),
  sortableHeaders: Array.from(document.querySelectorAll("th.sortable")),
  modalOverlay: document.getElementById("modalOverlay"),
  modalClose: document.getElementById("modalClose"),
  modalAvatar: document.getElementById("modalAvatar"),
  modalName: document.getElementById("modalName"),
  modalJoined: document.getElementById("modalJoined"),
  modalCopy: document.getElementById("modalCopy"),
  modalAddressShort: document.getElementById("modalAddressShort"),
  modalProfileLink: document.getElementById("modalProfileLink"),
  modalLifetimePnl: document.getElementById("modalLifetimePnl"),
  modalLifetimeVol: document.getElementById("modalLifetimeVol"),
  modalLifetimePnlNote: document.getElementById("modalLifetimePnlNote"),
  modalLifetimeVolNote: document.getElementById("modalLifetimeVolNote"),
  modalPositionsCount: document.getElementById("modalPositionsCount"),
  modalPositionsValue: document.getElementById("modalPositionsValue"),
  modalTradesCount: document.getElementById("modalTradesCount"),
  modalChart: document.getElementById("modalChart"),
  modalPositions: document.getElementById("modalPositions"),
  modalHistory: document.getElementById("modalHistory"),
  modalTradeSummary: document.getElementById("modalTradeSummary"),
  modalPositionSummary: document.getElementById("modalPositionSummary"),
  chartValue: document.getElementById("chartValue"),
};

const SMART_MONEY_ALLOWLIST = new Set(
  [
    // Example addresses. Replace with your own smart money labels.
    "0x0000000000000000000000000000000000000000",
  ].map((address) => address.toLowerCase())
);

const VERIFIED_ALLOWLIST = new Set(
  [
    // Optional: add any known verified wallets you want to highlight.
  ].map((address) => address.toLowerCase())
);

let leaderboard = [];
let sortState = { key: "pnl", direction: "desc" };
const labelCache = new Map();
const eventCache = new Map();
const positionsCache = new Map();
const profileCache = new Map();
const valueCache = new Map();
const activityCache = new Map();
const closedPositionsCache = new Map();
let loadSequence = 0;
let reloadTimer = null;
let activeModalAddress = null;
let currentChartPoints = [];
let currentClosedPositions = [];
let activeChartRange = "all";
const DETAILS_LIMIT = 20;
const DETAILS_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
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

function shortAddress(address) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeUsername(name, address) {
  if (!name) return shortAddress(address);
  const normalized = name.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    return shortAddress(normalized);
  }
  return normalized;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
    elements.toast.classList.add("hidden");
  }, 1500);
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function setStatus(message, isLoading = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("loading", isLoading);
}

function updateStats() {
  elements.statCategory.textContent = elements.category.selectedOptions[0].textContent;
  elements.statPeriod.textContent = elements.timePeriod.selectedOptions[0].textContent;
  elements.statCount.textContent = leaderboard.length.toString();
}

function getFilteredRows() {
  const query = elements.search.value.trim().toLowerCase();
  if (!query) return leaderboard;

  return leaderboard.filter((row) => {
    const name = row.name ? row.name.toLowerCase() : "";
    const address = row.address ? row.address.toLowerCase() : "";
    return name.includes(query) || address.includes(query);
  });
}

function renderTable() {
  const rows = getFilteredRows();

  elements.rows.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    const pnlClass = row.pnl >= 0 ? "positive" : "negative";

    tr.innerHTML = `
      <td>${row.rank ?? "—"}</td>
      <td>
        <button class="address-link" data-address="${row.address || ""}">
          <span class="username-pill">${normalizeUsername(row.name, row.address)}</span>
        </button>
        <div class="address">
          <span>${shortAddress(row.address)}</span>
          ${
            row.address
              ? `<button class="copy-btn-table" data-copy="${row.address}" type="button">⧉</button>`
              : ""
          }
        </div>
      </td>
      <td>${row.event || "—"}</td>
      <td>${
        row.positionsCount === null
          ? "—"
          : `<span class="positions-value">${formatCurrency(row.positionsValue)}</span>`
      }</td>
      <td class="pnl ${pnlClass}">${formatCurrency(row.pnl)}</td>
      <td>${formatCurrency(row.volume)}</td>
    `;

    elements.rows.appendChild(tr);
  });
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function exportCsv() {
  const rows = getFilteredRows();
  const headers = [
    "Rank",
    "Name",
    "Address",
    "Event",
    "Positions Count",
    "Positions Value",
    "PNL",
    "Volume",
  ];

  const lines = [headers.join(",")];
  rows.forEach((row) => {
    const line = [
      row.rank ?? "",
      row.name ?? "",
      row.address ?? "",
      row.event ?? "",
      row.positionsCount ?? "",
      row.positionsValue ?? "",
      row.pnl ?? "",
      row.volume ?? "",
    ].map(escapeCsv);
    lines.push(line.join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `polymarket-leaderboard-${date}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function applySort() {
  const { key, direction } = sortState;
  const factor = direction === "asc" ? 1 : -1;

  leaderboard.sort((a, b) => {
    const valueA = a[key] ?? 0;
    const valueB = b[key] ?? 0;
    return (valueA - valueB) * factor;
  });

  elements.sortableHeaders.forEach((header) => {
    header.classList.remove("sorted-asc", "sorted-desc");
    if (header.dataset.sort === key) {
      header.classList.add(direction === "asc" ? "sorted-asc" : "sorted-desc");
    }
  });
}

function updateTable() {
  applySort();
  renderTable();
  updateStats();
}

async function fetchLeaderboard() {
  const category = elements.category.value;
  const timePeriod = elements.timePeriod.value;
  const limit = Number(elements.limit.value);

  const url = new URL(`${API_BASE}/v1/leaderboard`);
  url.searchParams.set("category", category);
  url.searchParams.set("timePeriod", timePeriod);
  url.searchParams.set("limit", limit.toString());

  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) {
    throw new Error(`Leaderboard request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchLabels(address, apiKey) {
  if (!address || !apiKey) return [];

  const normalized = address.toLowerCase();
  if (labelCache.has(normalized)) {
    return labelCache.get(normalized);
  }

  const url = new URL(`${LABELS_API_BASE}/ethereum/label/${normalized}`);
  url.searchParams.set("apikey", apiKey);

  const response = await fetchWithTimeout(url.toString()).catch(() => null);
  if (!response || !response.ok) {
    labelCache.set(normalized, []);
    return [];
  }

  const payload = await response.json();
  const labels = Array.isArray(payload?.data) ? payload.data : [];
  labelCache.set(normalized, labels);
  return labels;
}

async function fetchLastEvent(address) {
  if (!address) return null;
  const normalized = address.toLowerCase();
  const cached = eventCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) {
    return cached.value;
  }

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
  const title =
    activity?.title || activity?.name || activity?.eventTitle || activity?.eventSlug || null;
  eventCache.set(normalized, { value: title, timestamp: Date.now() });
  return title;
}

async function fetchPositions(address) {
  if (!address) return [];
  const normalized = address.toLowerCase();
  const cached = positionsCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) {
    return cached.value;
  }

  const url = new URL(`${API_BASE}/positions`);
  url.searchParams.set("user", address);
  url.searchParams.set("limit", "100");
  url.searchParams.set("sizeThreshold", "1");

  const response = await fetchWithTimeout(url.toString()).catch(() => null);
  if (!response || !response.ok) return [];

  const data = await response.json();
  const positions = Array.isArray(data) ? data : [];
  positionsCache.set(normalized, { value: positions, timestamp: Date.now() });
  return positions;
}

async function fetchProfile(address) {
  if (!address) return null;
  const normalized = address.toLowerCase();
  const cached = profileCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) {
    return cached.value;
  }

  const url = new URL("/api/public-profile", window.location.origin);
  url.searchParams.set("address", address);

  const response = await fetchWithTimeout(url.toString()).catch(() => null);
  if (!response || !response.ok) return null;
  const data = await response.json();
  profileCache.set(normalized, { value: data, timestamp: Date.now() });
  return data;
}

async function fetchValue(address) {
  if (!address) return null;
  const normalized = address.toLowerCase();
  const cached = valueCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) {
    return cached.value;
  }

  const url = new URL(`${API_BASE}/value`);
  url.searchParams.set("user", address);

  const response = await fetchWithTimeout(url.toString()).catch(() => null);
  if (!response || !response.ok) return null;
  const data = await response.json();
  const entry = Array.isArray(data) ? data[0] : data;
  valueCache.set(normalized, { value: entry, timestamp: Date.now() });
  return entry;
}

async function fetchActivity(address, limit = 200) {
  if (!address) return [];
  const normalized = address.toLowerCase();
  const cached = activityCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) {
    return cached.value;
  }

  const url = new URL(`${API_BASE}/activity`);
  url.searchParams.set("user", address);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sortBy", "TIMESTAMP");
  url.searchParams.set("sortDirection", "DESC");

  const response = await fetchWithTimeout(url.toString()).catch(() => null);
  if (!response || !response.ok) return [];
  const data = await response.json();
  const activity = Array.isArray(data) ? data : [];
  activityCache.set(normalized, { value: activity, timestamp: Date.now() });
  return activity;
}

async function fetchClosedPositions(address) {
  if (!address) return [];
  const normalized = address.toLowerCase();
  const cached = closedPositionsCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < DETAILS_TTL_MS) {
    return cached.value;
  }

  const url = new URL(`${API_BASE}/closed-positions`);
  url.searchParams.set("user", address);
  url.searchParams.set("limit", "50");
  url.searchParams.set("sortBy", "TIMESTAMP");
  url.searchParams.set("sortDirection", "ASC");

  const response = await fetchWithTimeout(url.toString()).catch(() => null);
  if (!response || !response.ok) return [];
  const data = await response.json();
  const positions = Array.isArray(data) ? data : [];
  closedPositionsCache.set(normalized, { value: positions, timestamp: Date.now() });
  return positions;
}

function formatDate(dateValue) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function renderPositionsList(positions) {
  if (!positions || positions.length === 0) {
    return "<div class=\"chart-empty\">No open positions.</div>";
  }

  return positions
    .slice(0, 6)
    .map((position) => {
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

function renderHistoryList(activity) {
  if (!activity || activity.length === 0) {
    return "<div class=\"chart-empty\">No recent trades.</div>";
  }

  return activity
    .slice(0, 10)
    .map((item) => {
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

function renderTradeSummary(activity) {
  if (!activity || activity.length === 0) {
    return "<div class=\"chart-empty\">No recent trades.</div>";
  }
  const trades = activity.filter((item) => item?.type === "TRADE");
  const buys = trades.filter((item) => item?.side === "BUY").length;
  const sells = trades.filter((item) => item?.side === "SELL").length;
  const volume = trades.reduce((sum, item) => sum + Number(item?.usdcSize ?? 0), 0);

  return `
    <div class="panel-item"><strong>Trades</strong> ${trades.length}</div>
    <div class="panel-item"><strong>Buys</strong> ${buys}</div>
    <div class="panel-item"><strong>Sells</strong> ${sells}</div>
    <div class="panel-item"><strong>Volume</strong> ${formatCurrency(volume)}</div>
  `;
}

function renderPositionSummary(positions, positionsValue) {
  if (!positions || positions.length === 0) {
    return "<div class=\"chart-empty\">No open positions.</div>";
  }
  const top = [...positions].sort((a, b) => {
    const aValue = Number(a?.currentValue ?? a?.value ?? 0);
    const bValue = Number(b?.currentValue ?? b?.value ?? 0);
    return bValue - aValue;
  })[0];

  const topTitle = top?.market?.question || top?.marketTitle || "Unknown market";
  const topValue = Number(top?.currentValue ?? top?.value ?? 0);

  return `
    <div class="panel-item"><strong>Open Positions</strong> ${positions.length}</div>
    <div class="panel-item"><strong>Total Value</strong> ${formatCurrency(positionsValue)}</div>
    <div class="panel-item"><strong>Largest Position</strong> ${topTitle}</div>
    <div class="panel-item"><strong>Largest Value</strong> ${formatCurrency(topValue)}</div>
  `;
}

function toTimestamp(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isNaN(time) && time > 0) return time;
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric <= 0) return 0;
  return numeric < 1e12 ? numeric * 1000 : numeric;
}

function filterPositionsByRange(positions, range) {
  if (!positions || positions.length === 0) return [];
  if (range === "all") return positions;

  const now = Date.now();
  const days = range === "1d" ? 1 : range === "7d" ? 7 : 30;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return positions.filter((item) => {
    const timestamp = toTimestamp(item?.timestamp || item?.closedAt || item?.closedTimestamp);
    return timestamp >= cutoff;
  });
}

function renderPnlChart(positions, range = "all") {
  currentClosedPositions = positions || [];
  activeChartRange = range;
  const filtered = filterPositionsByRange(positions, range);
  if (!positions || positions.length === 0) {
    elements.modalChart.innerHTML = '<div class="chart-empty">No closed positions yet.</div>';
    currentChartPoints = [];
    elements.chartValue.textContent = "$0.00";
    return;
  }

  if (filtered.length === 0) {
    elements.modalChart.innerHTML = '<div class="chart-empty">No PNL data for this range.</div>';
    currentChartPoints = [];
    elements.chartValue.textContent = "$0.00";
    return;
  }

  const series = filtered
    .map((item) => ({
      timestamp: toTimestamp(item?.timestamp || item?.closedAt || item?.closedTimestamp),
      pnl: Number(item?.realizedPnl ?? item?.pnl ?? 0),
    }))
    .filter((item) => !Number.isNaN(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (series.length === 0) {
    elements.modalChart.innerHTML = '<div class="chart-empty">No closed positions yet.</div>';
    currentChartPoints = [];
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
  const height = 180;
  const padding = 18;

  currentChartPoints = points.map((point) => {
    const x = padding + ((point.x - minX) / rangeX) * (width - padding * 2);
    const y = padding + (1 - (point.y - minY) / rangeY) * (height - padding * 2);
    return { ...point, sx: x, sy: y };
  });

  const lastValue = points[points.length - 1]?.y ?? 0;
  elements.chartValue.textContent = formatCurrency(lastValue);
  elements.chartValue.textContent = formatCurrency(lastValue);

  const polyline = currentChartPoints.map((point) => `${point.sx},${point.sy}`).join(" ");

  elements.modalChart.innerHTML = `
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

  const tooltip = elements.modalChart.querySelector("#chartTooltip");
  const svg = elements.modalChart.querySelector("[data-chart]");

  svg.addEventListener("mousemove", (event) => {
    if (!currentChartPoints.length) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    let closest = currentChartPoints[0];
    let minDist = Math.abs(closest.sx - x);
    for (const point of currentChartPoints) {
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
  });

  svg.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}

function normalizeResult(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

async function openModal(row) {
  if (!row?.address) return;
  activeModalAddress = row.address;
  elements.modalOverlay.classList.remove("hidden");

  elements.modalName.textContent = row.name || shortAddress(row.address);
  elements.modalJoined.textContent = "Joined —";
  elements.modalAddressShort.textContent = shortAddress(row.address);
  elements.modalProfileLink.href = `https://polymarket.com/profile/${row.address}`;
  elements.modalLifetimePnl.textContent = "—";
  elements.modalLifetimeVol.textContent = "—";
  elements.modalLifetimePnl.classList.remove("neg");
  elements.modalLifetimePnlNote.textContent = "Based on closed positions";
  elements.modalLifetimeVolNote.textContent = "Based on recent activity";
  elements.modalPositionsCount.textContent = "—";
  elements.modalPositionsValue.textContent = "—";
  elements.modalTradesCount.textContent = "—";
  elements.modalPositions.innerHTML = "Loading...";
  elements.modalHistory.innerHTML = "Loading...";
  elements.modalTradeSummary.innerHTML = "Loading...";
  elements.modalPositionSummary.innerHTML = "Loading...";
  elements.modalChart.innerHTML = "<div class=\"chart-empty\">Loading...</div>";

  const results = await Promise.allSettled([
    fetchProfile(row.address),
    fetchValue(row.address),
    fetchPositions(row.address),
    fetchActivity(row.address, 200),
    fetchClosedPositions(row.address),
  ]);

  const profile = normalizeResult(results[0], null);
  const value = normalizeResult(results[1], null);
  const positions = normalizeResult(results[2], []);
  const activity = normalizeResult(results[3], []);
  const closedPositions = normalizeResult(results[4], []);

  if (activeModalAddress !== row.address) return;

  const profileName =
    profile?.name || profile?.username || profile?.displayName || row.name || shortAddress(row.address);
  elements.modalName.textContent = profileName;
  elements.modalAvatar.textContent = (profileName || "?").slice(0, 1).toUpperCase();

  const joined = profile?.createdAt || profile?.created_at || profile?.created;
  elements.modalJoined.textContent = joined ? `Joined ${formatDate(joined)}` : "Joined —";

  const positionsValue =
    Number(value?.totalValue ?? value?.value ?? value?.portfolioValue ?? 0) ||
    positions.reduce((sum, item) => sum + Number(item?.currentValue ?? item?.value ?? 0), 0);
  elements.modalPositionsCount.textContent = positions.length.toString();
  elements.modalPositionsValue.textContent = formatCurrency(positionsValue);

  const trades = activity.filter((item) => item?.type === "TRADE");
  elements.modalTradesCount.textContent = trades.length.toString();
  const volume = trades.reduce((sum, item) => sum + Number(item?.usdcSize ?? 0), 0);
  elements.modalLifetimeVol.textContent = formatCurrency(volume);

  const realized = closedPositions.reduce(
    (sum, item) => sum + Number(item?.realizedPnl ?? item?.pnl ?? 0),
    0
  );
  elements.modalLifetimePnl.textContent = formatCurrency(realized);
  elements.modalLifetimePnl.classList.toggle("neg", realized < 0);

  elements.modalPositions.innerHTML = renderPositionsList(positions);
  elements.modalHistory.innerHTML = renderHistoryList(activity);
  elements.modalTradeSummary.innerHTML = renderTradeSummary(activity);
  elements.modalPositionSummary.innerHTML = renderPositionSummary(positions, positionsValue);
  renderPnlChart(closedPositions, activeChartRange);
}

function closeModal() {
  activeModalAddress = null;
  elements.modalOverlay.classList.add("hidden");
}

function classifySmartMoney(row, labels) {
  const labelText = labels
    .map((label) =>
      [
        label.address_name,
        label.label,
        label.label_type,
        label.label_subtype,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    )
    .join(" ");

  const labelMatch = SMART_MONEY_KEYWORDS.some((keyword) => labelText.includes(keyword));

  const volume = row.volume || 0;
  const pnl = row.pnl || 0;
  const pnlToVolume = volume > 0 ? pnl / volume : 0;
  const strongPnlRule = pnl >= 5000 && volume >= 10000 && pnlToVolume >= 0.1;
  const topRankRule = row.rank !== null && row.rank <= 5 && pnl > 0;

  return labelMatch || strongPnlRule || topRankRule;
}

async function withConcurrency(items, limit, worker) {
  const queue = items.slice();
  const results = [];

  async function run() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) continue;
      const result = await worker(item);
      results.push(result);
    }
  }

  const runners = Array.from({ length: limit }, () => run());
  await Promise.all(runners);
  return results;
}

async function loadLeaderboard() {
  const currentLoad = ++loadSequence;
  setStatus("Loading leaderboard...", true);
  elements.refresh.disabled = true;

  try {
    const data = await fetchLeaderboard();
    if (currentLoad !== loadSequence) return;

    leaderboard = data.map((entry, index) => {
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
        isVerified:
          entry.verifiedBadge === true || (normalized ? VERIFIED_ALLOWLIST.has(normalized) : false),
        labels: [],
      };
    });

    const apiKey = localStorage.getItem("walletLabelsApiKey") || "";
    if (apiKey) {
      setStatus("Fetching wallet labels...", true);
      await withConcurrency(leaderboard, 6, async (row) => {
        row.labels = await fetchLabels(row.address, apiKey);
        if (!row.isSmartMoney) {
          row.isSmartMoney = classifySmartMoney(row, row.labels);
        }
        return row;
      });
      if (currentLoad !== loadSequence) return;
    }

    const detailRows = leaderboard.slice(0, DETAILS_LIMIT);

    setStatus(`Fetching last event for top ${DETAILS_LIMIT}...`, true);
    await withConcurrency(detailRows, 6, async (row) => {
      row.event = await fetchLastEvent(row.address);
      return row;
    });
    if (currentLoad !== loadSequence) return;

    setStatus(`Fetching positions for top ${DETAILS_LIMIT}...`, true);
    await withConcurrency(detailRows, 6, async (row) => {
      const positions = await fetchPositions(row.address);
      row.positionsCount = positions.length;
      row.positionsValue = positions.reduce((sum, position) => {
        const value = Number(position?.currentValue ?? position?.value ?? 0);
        return sum + (Number.isNaN(value) ? 0 : value);
      }, 0);
      return row;
    });
    if (currentLoad !== loadSequence) return;

    updateTable();
    setStatus(`Loaded ${leaderboard.length} rows.`, false);
  } catch (error) {
    console.error(error);
    setStatus("Unable to load leaderboard. Check console for details.", false);
  } finally {
    if (currentLoad === loadSequence) {
      elements.refresh.disabled = false;
    }
  }
}

function setupSortHandlers() {
  elements.sortableHeaders.forEach((header) => {
    header.addEventListener("click", () => {
      const key = header.dataset.sort;
      if (sortState.key === key) {
        sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      } else {
        sortState = { key, direction: "desc" };
      }
      updateTable();
    });
  });
}

setupSortHandlers();

function scheduleReload() {
  if (reloadTimer) window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => {
    loadLeaderboard();
  }, 200);
}

elements.category.addEventListener("change", scheduleReload);
elements.timePeriod.addEventListener("change", scheduleReload);
elements.limit.addEventListener("change", scheduleReload);
elements.search.addEventListener("input", () => {
  renderTable();
});

elements.exportCsv.addEventListener("click", () => {
  exportCsv();
});

elements.refresh.addEventListener("click", () => {
  loadLeaderboard();
});

elements.rows.addEventListener("click", (event) => {
  const target = event.target.closest(".address-link");
  if (!target) return;
  const address = target.dataset.address;
  const row = leaderboard.find((entry) => entry.address === address);
  if (row) openModal(row);
});

elements.rows.addEventListener("click", async (event) => {
  const copyBtn = event.target.closest(".copy-btn-table");
  if (!copyBtn) return;
  const address = copyBtn.dataset.copy;
  if (!address) return;
  try {
    await navigator.clipboard.writeText(address);
    showToast("Address copied");
  } catch (error) {
    console.error(error);
  }
});

elements.modalClose.addEventListener("click", () => {
  closeModal();
});

elements.modalOverlay.addEventListener("click", (event) => {
  if (event.target === elements.modalOverlay) {
    closeModal();
  }
});

elements.modalCopy.addEventListener("click", async () => {
  if (!activeModalAddress) return;
  try {
    await navigator.clipboard.writeText(activeModalAddress);
    elements.modalAddressShort.textContent = "Copied!";
    setTimeout(() => {
      if (activeModalAddress) {
        elements.modalAddressShort.textContent = shortAddress(activeModalAddress);
      }
    }, 1200);
  } catch (error) {
    console.error(error);
  }
});


loadLeaderboard();
