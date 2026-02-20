type BookLevel = {
  price: number;
  size: number;
};

type HolderRow = {
  holder: string;
  size: number | null;
  pctOfVisible: number | null;
};

type AttemptLog = {
  endpoint: string;
  status: string;
  detail?: string | null;
};

const BOOK_SAMPLE_LEVELS = 28;
const DEFAULT_SWEEP_SIZE = 100;

export async function buildWeatherMarketMeta(snapshot: Record<string, unknown>) {
  const tokenContext = resolveTokenContext(snapshot);
  const liveBook = tokenContext.tokenId ? await loadOrderbook(tokenContext.tokenId) : emptyBookDebug("missing_token_id");

  const bids = liveBook?.bids ?? [];
  const asks = liveBook?.asks ?? [];

  const bestBid = bids[0]?.price ?? numberOrNull(snapshot.bestBid);
  const bestAsk = asks[0]?.price ?? numberOrNull(snapshot.bestAsk);
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spread =
    bestBid !== null && bestAsk !== null && bestAsk >= bestBid ? bestAsk - bestBid : numberOrNull(snapshot.spread);
  const spreadBps = mid && spread !== null && mid > 0 ? (spread / mid) * 10_000 : null;

  const buySweep = simulateSweep(asks, DEFAULT_SWEEP_SIZE, "buy");
  const sellSweep = simulateSweep(bids, DEFAULT_SWEEP_SIZE, "sell");

  const orderbook = {
    bestBid,
    bestAsk,
    mid,
    spread,
    spreadBps,
    volume: numberOrNull(snapshot.volume ?? snapshot.volumeNum),
    liquidity: numberOrNull(snapshot.liquidity ?? snapshot.liquidityNum),
    minTick: numberOrNull(snapshot.orderPriceMinTickSize),
    minSize: numberOrNull(snapshot.orderMinSize),
    active: Boolean(snapshot.active),
    closed: Boolean(snapshot.closed),
    tokenId: tokenContext.tokenId,
    tokenLabel: tokenContext.tokenLabel,
    depth5c: {
      bidSize: depthNearTop(bids, "bid", 0.05),
      askSize: depthNearTop(asks, "ask", 0.05),
    },
    execution: {
      sampleSize: DEFAULT_SWEEP_SIZE,
      buyAvg: buySweep.avgPrice,
      buySlippage: buySweep.slippage,
      buyFillPct: buySweep.fillPct,
      sellAvg: sellSweep.avgPrice,
      sellSlippage: sellSweep.slippage,
      sellFillPct: sellSweep.fillPct,
    },
    levels: {
      bids: bids.slice(0, BOOK_SAMPLE_LEVELS),
      asks: asks.slice(0, BOOK_SAMPLE_LEVELS),
    },
    unavailableReason: bids.length === 0 && asks.length === 0 ? explainReason(liveBook.reason) : undefined,
    debug: {
      tokenResolution: tokenContext.reason,
      reason: liveBook.reason,
      attempts: liveBook.attempts,
    },
    source: bids.length > 0 || asks.length > 0 ? "clob" : "snapshot",
  };

  const resolution = {
    source: stringOrNull(snapshot.resolutionSource),
    rules: stringOrNull(snapshot.description),
    endDate: stringOrNull(snapshot.endDate),
  };

  const holders = await loadTopHolders(snapshot, tokenContext.tokenId);
  return { orderbook, resolution, holders };
}

function resolveTokenContext(snapshot: Record<string, unknown>) {
  const outcomes = parseStringArray(snapshot.outcomes);
  const tokenIds = parseStringArray(snapshot.clobTokenIds);
  if (outcomes.length === 0 || tokenIds.length === 0) {
    return {
      tokenId: null as string | null,
      tokenLabel: null as string | null,
      reason: "snapshot_missing_outcomes_or_clobTokenIds",
    };
  }

  const yesIndex = outcomes.findIndex((item) => item.toLowerCase() === "yes");
  const index = yesIndex >= 0 ? yesIndex : 0;
  const resolvedToken = tokenIds[index] ?? tokenIds[0] ?? null;

  return {
    tokenId: resolvedToken,
    tokenLabel: outcomes[index] ?? outcomes[0] ?? null,
    reason: resolvedToken ? `resolved_${outcomes[index] ?? outcomes[0] ?? "outcome"}_token` : "token_unresolved_after_parsing",
  };
}

async function loadOrderbook(tokenId: string) {
  const urls = [
    `https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`,
    `https://data-api.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`,
  ];

  const attempts: AttemptLog[] = [];
  let lastReason = "book_unavailable";

  for (const url of urls) {
    const response = await fetchWithTimeout(url, 3500);
    if (!response) {
      attempts.push({ endpoint: shortEndpoint(url), status: "network_or_timeout", detail: null });
      lastReason = "book_network_or_timeout";
      continue;
    }
    if (!response.ok) {
      attempts.push({ endpoint: shortEndpoint(url), status: `http_${response.status}`, detail: response.statusText || null });
      lastReason = `book_http_${response.status}`;
      continue;
    }

    const json = await response.json().catch(() => null);
    if (!json) {
      attempts.push({ endpoint: shortEndpoint(url), status: "invalid_json", detail: null });
      lastReason = "book_invalid_json";
      continue;
    }

    const bids = parseBookLevels((json as any)?.bids ?? (json as any)?.book?.bids, "bid");
    const asks = parseBookLevels((json as any)?.asks ?? (json as any)?.book?.asks, "ask");
    if (bids.length || asks.length) {
      attempts.push({ endpoint: shortEndpoint(url), status: "ok", detail: `bids=${bids.length},asks=${asks.length}` });
      return { bids, asks, reason: null as string | null, attempts };
    }
    attempts.push({ endpoint: shortEndpoint(url), status: "ok_empty_levels", detail: "no bids/asks" });
    lastReason = "book_empty_levels";
  }

  return { bids: [] as BookLevel[], asks: [] as BookLevel[], reason: lastReason, attempts };
}

function parseBookLevels(input: unknown, side: "bid" | "ask") {
  if (!Array.isArray(input)) return [] as BookLevel[];

  const levels = input
    .map((item) => {
      const row = item as Record<string, unknown>;
      const price = numberOrNull(row.price ?? row.px);
      const size = numberOrNull(row.size ?? row.qty ?? row.quantity);
      if (price === null || size === null || size <= 0) return null;
      return { price, size };
    })
    .filter((row): row is BookLevel => Boolean(row));

  levels.sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  return levels;
}

function simulateSweep(levels: BookLevel[], targetSize: number, side: "buy" | "sell") {
  if (levels.length === 0 || targetSize <= 0) {
    return { avgPrice: null as number | null, slippage: null as number | null, fillPct: 0 };
  }

  const best = levels[0].price;
  let remaining = targetSize;
  let filled = 0;
  let notional = 0;

  for (const level of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.size);
    filled += take;
    notional += take * level.price;
    remaining -= take;
  }

  if (filled <= 0) {
    return { avgPrice: null as number | null, slippage: null as number | null, fillPct: 0 };
  }

  const avgPrice = notional / filled;
  const slippage = side === "buy" ? avgPrice - best : best - avgPrice;
  return {
    avgPrice,
    slippage,
    fillPct: Math.min(1, filled / targetSize),
  };
}

function depthNearTop(levels: BookLevel[], side: "bid" | "ask", delta: number) {
  if (levels.length === 0) return 0;
  const best = levels[0].price;
  return levels.reduce((sum, level) => {
    if (side === "bid" && level.price >= best - delta) return sum + level.size;
    if (side === "ask" && level.price <= best + delta) return sum + level.size;
    return sum;
  }, 0);
}

async function loadTopHolders(snapshot: Record<string, unknown>, assetId: string | null) {
  const slug = stringOrNull(snapshot.slug);
  const conditionId = stringOrNull(snapshot.conditionId);
  const marketId = stringOrNull(snapshot.id);

  const urls = [
    assetId ? `https://data-api.polymarket.com/holders?asset_id=${encodeURIComponent(assetId)}&limit=10&offset=0` : null,
    conditionId
      ? `https://data-api.polymarket.com/holders?market=${encodeURIComponent(conditionId)}&limit=10&offset=0`
      : null,
    marketId ? `https://data-api.polymarket.com/holders?market=${encodeURIComponent(marketId)}&limit=10&offset=0` : null,
    slug ? `https://data-api.polymarket.com/holders?market=${encodeURIComponent(slug)}&limit=10&offset=0` : null,
  ].filter((value): value is string => Boolean(value));

  if (urls.length === 0) {
    return {
      available: false,
      source: "data-api",
      rows: [] as HolderRow[],
      message: "Top holders unavailable from public endpoint for this market.",
      debug: {
        reason: "missing_identifiers_for_holders_lookup",
        attempts: [] as AttemptLog[],
      },
    };
  }

  const attempts: AttemptLog[] = [];
  let lastReason = "holders_unavailable";

  for (const url of urls) {
    const response = await fetchWithTimeout(url, 3500);
    if (!response) {
      attempts.push({ endpoint: shortEndpoint(url), status: "network_or_timeout", detail: null });
      lastReason = "holders_network_or_timeout";
      continue;
    }
    if (!response.ok) {
      attempts.push({ endpoint: shortEndpoint(url), status: `http_${response.status}`, detail: response.statusText || null });
      lastReason = `holders_http_${response.status}`;
      continue;
    }
    const json = await response.json().catch(() => null);
    if (!json) {
      attempts.push({ endpoint: shortEndpoint(url), status: "invalid_json", detail: null });
      lastReason = "holders_invalid_json";
      continue;
    }
    const rows = parseHolders(json);
    if (rows.length > 0) {
      attempts.push({ endpoint: shortEndpoint(url), status: "ok", detail: `rows=${rows.length}` });
      return {
        available: true,
        source: "data-api",
        rows,
        debug: {
          reason: null,
          attempts,
        },
      };
    }
    attempts.push({ endpoint: shortEndpoint(url), status: "ok_empty_rows", detail: "no holder rows" });
    lastReason = "holders_empty_rows";
  }

  return {
    available: false,
    source: "data-api",
    rows: [] as HolderRow[],
    message: `Top holders unavailable from public endpoint for this market.`,
    debug: {
      reason: lastReason,
      attempts,
    },
  };
}

function parseHolders(payload: unknown) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.data)
      ? (payload as any).data
      : Array.isArray((payload as any)?.holders)
        ? (payload as any).holders
        : [];

  const rows = list
    .map((item: any) => {
      const holder = String(item?.proxyWallet || item?.wallet || item?.address || item?.holder || "").trim();
      if (!holder) return null;
      const size = numberOrNull(item?.size ?? item?.shares ?? item?.amount ?? item?.balance);
      return { holder, size };
    })
    .filter((row): row is { holder: string; size: number | null } => Boolean(row));

  const visibleTotal = rows.reduce((sum, row) => sum + (row.size ?? 0), 0);
  return rows.slice(0, 10).map((row) => ({
    holder: row.holder,
    size: row.size,
    pctOfVisible: visibleTotal > 0 && row.size !== null ? row.size / visibleTotal : null,
  }));
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map((item) => item.replace(/[\"\[\]]/g, "").trim())
        .filter(Boolean);
    }
  }

  return [] as string[];
}

function shortEndpoint(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function emptyBookDebug(reason: string) {
  return {
    bids: [] as BookLevel[],
    asks: [] as BookLevel[],
    reason,
    attempts: [] as AttemptLog[],
  };
}

function explainReason(reason: string | null) {
  if (!reason) return "Orderbook depth unavailable for this market token.";
  return `Orderbook depth unavailable: ${reason}`;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, next: { revalidate: 0 } });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isNaN(num) ? null : num;
}
