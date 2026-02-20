import { inferLocationAndDate } from "./schema";
import type { ForecastResult } from "./types";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 9000;

export async function fetchForecastForMarket(textSource: string): Promise<ForecastResult | null> {
  const inferred = inferLocationAndDate(textSource);
  if (!inferred) return null;

  const geo = await geocodeLocation(inferred.locationName);
  if (!geo) return null;

  const forecast = await fetchDailyForecast({
    latitude: geo.latitude,
    longitude: geo.longitude,
    date: inferred.targetDate,
  });

  if (!forecast) return null;

  return {
    locationName: geo.name,
    locationKey: normalizeLocationKey(geo.name),
    latitude: geo.latitude,
    longitude: geo.longitude,
    targetDate: inferred.targetDate,
    temperatureF: forecast.temperatureF,
    source: "open-meteo",
    raw: {
      geocode: geo.raw,
      forecast: forecast.raw,
    },
  };
}

async function geocodeLocation(name: string) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const payload = await fetchJson(url.toString());
  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!result) return null;

  return {
    name: String(result.name || name),
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    raw: result as Record<string, unknown>,
  };
}

async function fetchDailyForecast(args: { latitude: number; longitude: number; date: string }) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(args.latitude));
  url.searchParams.set("longitude", String(args.longitude));
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("start_date", args.date);
  url.searchParams.set("end_date", args.date);
  url.searchParams.set("timezone", "UTC");

  const payload = await fetchJson(url.toString());
  const daily = payload?.daily;
  if (!daily) return null;

  const max = Number(Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : NaN);
  const min = Number(Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : NaN);
  if (Number.isNaN(max) || Number.isNaN(min)) return null;

  return {
    temperatureF: (max + min) / 2,
    raw: payload as Record<string, unknown>,
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

function normalizeLocationKey(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  return cleaned || "default";
}
