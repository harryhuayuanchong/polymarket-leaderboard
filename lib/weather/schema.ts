import type { ParsedMarketSchema } from "./types";

export function parseThresholdSchema(question: string): ParsedMarketSchema {
  const normalized = question.trim();

  const parsed = parseDirectionalThreshold(normalized);
  if (parsed) return parsed;

  if (/\b(?:high|low)\b/i.test(normalized)) {
    return {
      support: "unsupported",
      side: null,
      thresholdF: null,
      reason: "Could not extract directional threshold (above/below) from market text.",
    };
  }

  return {
    support: "unsupported",
    side: null,
    thresholdF: null,
    reason: "Only directional threshold temperature markets are supported.",
  };
}

function parseDirectionalThreshold(text: string): ParsedMarketSchema | null {
  const lower = text.toLowerCase();
  const temp = extractTemperature(text);
  if (!temp) return null;

  const isHigh = /\b(high(?:est)?|max(?:imum)?)\s+temperature\b|\bhigh(?:est)?\b/i.test(text);
  const isLow = /\blow(?:est)?\s+temperature\b|\blow(?:est)?\b/i.test(text);
  const operator = inferOperator(lower);

  if (!operator || (!isHigh && !isLow)) return null;

  const thresholdF = temp.unit === "C" ? cToF(temp.value) : temp.value;

  if (isHigh && operator === "GTE") {
    return { support: "supported", side: "HIGH_GTE", thresholdF };
  }
  if (isHigh && operator === "LTE") {
    return { support: "supported", side: "HIGH_LTE", thresholdF };
  }
  if (isLow && operator === "GTE") {
    return { support: "supported", side: "LOW_GTE", thresholdF };
  }
  if (isLow && operator === "LTE") {
    return { support: "supported", side: "LOW_LTE", thresholdF };
  }

  return null;
}

function extractTemperature(text: string): { value: number; unit: "C" | "F" } | null {
  const explicitUnit = text.match(/(-?\d+(?:\.\d+)?)\s*°\s*([CF])/i) || text.match(/(-?\d+(?:\.\d+)?)\s*([CF])/i);
  if (explicitUnit) {
    const value = Number(explicitUnit[1]);
    if (Number.isNaN(value)) return null;
    const unit = explicitUnit[2].toUpperCase() === "C" ? "C" : "F";
    return { value, unit };
  }

  const directional = text.match(/(-?\d+(?:\.\d+)?)\s*(?:or\s+(?:above|below|higher|lower)|>=|<=)/i);
  if (!directional) return null;
  const value = Number(directional[1]);
  if (Number.isNaN(value)) return null;
  return { value, unit: "F" };
}

function inferOperator(text: string): "GTE" | "LTE" | null {
  if (text.includes(">=")) return "GTE";
  if (text.includes("<=")) return "LTE";
  if (/\b(or\s+above|or\s+higher|at\s+least|greater\s+than)\b/.test(text)) return "GTE";
  if (/\b(or\s+below|or\s+lower|at\s+most|less\s+than)\b/.test(text)) return "LTE";
  return null;
}

function cToF(c: number) {
  return c * (9 / 5) + 32;
}

export function inferLocationAndDate(text: string): { locationName: string; targetDate: string } | null {
  const cleaned = text.replace(/\s+/g, " ").trim();

  const date = inferDate(cleaned);
  const location = inferLocation(cleaned);

  if (!date || !location) return null;
  return {
    locationName: location,
    targetDate: date,
  };
}

function inferLocation(text: string) {
  const inMatch = text.match(/\bin\s+([A-Za-z][A-Za-z\s.'-]{2,})\b(?:\?|,| on | by | at |$)/i);
  if (inMatch?.[1]) {
    return inMatch[1].trim();
  }

  const forMatch = text.match(/\bfor\s+([A-Za-z][A-Za-z\s.'-]{2,})\b(?:\?|,| on | by | at |$)/i);
  if (forMatch?.[1]) {
    return forMatch[1].trim();
  }

  return "New York";
}

function inferDate(text: string) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];

  const monthDay = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?/i
  );

  if (monthDay) {
    const year = monthDay[3] ? Number(monthDay[3]) : new Date().getUTCFullYear();
    const month = monthIndex(monthDay[1]);
    const day = Number(monthDay[2]);
    if (month >= 0 && day >= 1 && day <= 31) {
      return toIsoDate(year, month, day);
    }
  }

  const relative = text.match(/\b(today|tomorrow)\b/i);
  if (relative) {
    const now = new Date();
    if (/tomorrow/i.test(relative[1])) now.setUTCDate(now.getUTCDate() + 1);
    return toIsoDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }

  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + 1);
  return toIsoDate(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate());
}

function monthIndex(monthName: string) {
  return [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].indexOf(monthName.toLowerCase());
}

function toIsoDate(year: number, monthIndexValue: number, day: number) {
  const date = new Date(Date.UTC(year, monthIndexValue, day));
  return date.toISOString().slice(0, 10);
}
