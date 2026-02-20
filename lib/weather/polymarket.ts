import type { PolymarketMarket } from "./types";

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const TIMEOUT_MS = 10_000;

export async function fetchMarketCandidate(input: { eventUrl?: string; eventTitle?: string }) {
  const fromUrl = await resolveFromUrl(input.eventUrl);
  if (fromUrl) return fromUrl;

  const fromTitle = await resolveFromTitle(input.eventTitle);
  if (fromTitle) return fromTitle;

  return null;
}

export async function searchMarketsByTitle(title?: string, limit = 20) {
  const query = (title || "").trim().toLowerCase();
  if (!query) return [] as PolymarketMarket[];
  const tokens = query.split(/\s+/).filter(Boolean);
  const weatherScoped = await listTaggedWeatherMarkets(250);
  const direct = weatherScoped.filter((item) => {
    const text = `${item.eventTitle} ${item.question}`.toLowerCase();
    return tokens.every((token) => text.includes(token));
  });
  if (direct.length > 0) return direct.slice(0, limit);

  return listMarketsByPredicate((text) => tokens.every((token) => text.includes(token)), limit);
}

export async function listDefaultWeatherMarkets(limit = 20) {
  const tagged = await listTaggedWeatherMarkets(limit);
  if (tagged.length > 0) return tagged;

  return listMarketsByPredicate(
    (text) =>
      /\b(weather|temperature|temperatures|rain|snow|hurricane|forecast|high temperature|low temperature|high in|low in|degrees)\b/i.test(
        text
      ),
    limit
  );
}

async function resolveFromUrl(eventUrl?: string) {
  if (!eventUrl) return null;
  const topic = extractClimateTopic(eventUrl);
  if (topic) {
    const climateCandidates =
      topic === "weather" || topic === "temperature"
        ? await listDefaultWeatherMarkets(20)
        : await searchMarketsByTitle(topic, 20);
    if (climateCandidates.length > 0) {
      return (
        climateCandidates.find(
          (row) => /\b(high temperature|low temperature|high in|low in|temperature)\b/i.test(row.question)
        ) || climateCandidates[0]
      );
    }
  }

  const slug = extractEventSlug(eventUrl);
  if (slug) {
    const bySlug = await fetchEventBySlug(slug);
    if (bySlug.length > 0) {
      const selected = bySlug.find((row) => /\b(high|low)\b/i.test(row.question)) || bySlug[0];
      return selected;
    }
  }

  const titleLike = decodeURIComponent(eventUrl.split("/").pop() || "").replace(/-/g, " ").trim();
  if (!titleLike) return null;
  const candidates = await searchMarketsByTitle(titleLike, 10);
  return candidates[0] ?? null;
}

async function resolveFromTitle(eventTitle?: string) {
  const candidates = await searchMarketsByTitle(eventTitle, 20);
  const thresholdFirst = candidates.find((row) => /\b(high|low)\b/i.test(row.question));
  return thresholdFirst ?? candidates[0] ?? null;
}

async function fetchEventBySlug(slug: string) {
  const url = new URL(`${GAMMA_BASE}/events`);
  url.searchParams.set("slug", slug);
  url.searchParams.set("limit", "5");

  const payload = await fetchJson(url.toString());
  const events = Array.isArray(payload) ? payload : [];
  const markets = events.flatMap((event: any) => (Array.isArray(event?.markets) ? event.markets : []));
  return markets.map((row) => toMarket(row)).filter((row): row is PolymarketMarket => row !== null);
}

function extractEventSlug(value: string) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/event\/([^/?#]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function extractClimateTopic(value: string) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/climate-science\/([^/?#]+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function toMarket(row: any): PolymarketMarket | null {
  if (!row || typeof row !== "object") return null;

  const question = pickString(row.question, row.title, row.name);
  const eventTitle = pickString(row.eventTitle, row.event?.title, row.events?.[0]?.title, row.title, question);
  const marketId = pickString(row.id, row.market_id, row.conditionId);
  const eventId = pickString(row.event_id, row.eventId, row.event?.id);

  if (!question || !eventTitle || !marketId) return null;

  const eventSlug = pickString(row.event_slug, row.eventSlug, row.event?.slug);
  const price = pickNumber(
    row.lastTradePrice,
    row.last_trade_price,
    row.price,
    row.bestAsk,
    row.outcomePrices?.[0]
  );
  const liquidity = pickNumber(row.liquidity, row.clobLiquidity, row.volume, row.volumeNum);
  const closeTime = pickString(row.endDate, row.end_date_iso, row.closedTime, row.closeTime, row.endTime);
  const url = eventSlug ? `https://polymarket.com/event/${eventSlug}` : null;
  const imageUrl = pickString(row.image, row.icon, row.event?.image, row.events?.[0]?.image) || null;

  return {
    marketId,
    eventId: eventId || marketId,
    eventTitle,
    eventSlug,
    question,
    price: clampPrice(price ?? 0.5),
    liquidity: Math.max(0, liquidity ?? 0),
    closeTime,
    url,
    imageUrl,
    raw: row as Record<string, unknown>,
  };
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, next: { revalidate: 0 } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function listMarketsByPredicate(predicate: (text: string) => boolean, limit: number) {
  const deduped = new Map<string, PolymarketMarket>();
  const pageSize = 200;
  const maxPages = 12;

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await fetchActiveMarketsPage(page * pageSize, pageSize);
    if (batch.length === 0) break;

    for (const raw of batch) {
      const market = toMarket(raw);
      if (!market) continue;
      const text = `${market.eventTitle} ${market.question}`.toLowerCase();
      if (!predicate(text)) continue;
      if (!deduped.has(market.marketId)) deduped.set(market.marketId, market);
    }

    if (deduped.size >= limit && page >= 2) break;
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.liquidity - a.liquidity)
    .slice(0, limit);
}

async function fetchActiveMarketsPage(offset: number, limit: number) {
  const url = new URL(`${GAMMA_BASE}/markets`);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));
  const payload = await fetchJson(url.toString());
  return Array.isArray(payload) ? payload : [];
}

async function listTaggedWeatherMarkets(limit: number) {
  const tagSlugs = ["weather", "temperature", "global-temp"];
  const eventLists = await Promise.all(tagSlugs.map((tag) => fetchEventsByTag(tag, 15)));
  const deduped = new Map<string, PolymarketMarket>();

  for (const events of eventLists) {
    for (const event of events) {
      const eventTitle = pickString(event?.title, event?.slug);
      const eventId = pickString(event?.id);
      const markets = Array.isArray(event?.markets) ? event.markets : [];

      for (const market of markets) {
        const normalized = toMarket({
          ...market,
          eventTitle,
          eventId,
          eventSlug: pickString(event?.slug),
          event: { title: eventTitle, id: eventId, slug: pickString(event?.slug) },
        });
        if (!normalized) continue;
        if (!deduped.has(normalized.marketId)) deduped.set(normalized.marketId, normalized);
      }
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.liquidity - a.liquidity)
    .slice(0, limit);
}

async function fetchEventsByTag(tagSlug: string, limit: number) {
  const url = new URL(`${GAMMA_BASE}/events`);
  url.searchParams.set("tag_slug", tagSlug);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("limit", String(limit));
  const payload = await fetchJson(url.toString());
  return Array.isArray(payload) ? payload : [];
}


function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function clampPrice(value: number) {
  return Math.max(0.01, Math.min(0.99, value));
}
