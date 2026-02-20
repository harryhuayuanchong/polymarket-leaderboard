import { NextResponse } from "next/server";
import { analyzeWeatherMarket } from "../../../../lib/weather/analyze";
import { getSupabaseAdmin } from "../../../../lib/weather/supabase";
import type { RiskProfile } from "../../../../lib/weather/types";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const eventUrl = typeof body?.eventUrl === "string" ? body.eventUrl.trim() : "";
    const eventTitle = typeof body?.eventTitle === "string" ? body.eventTitle.trim() : "";
    const riskProfile = normalizeRiskProfile(body?.riskProfile);

    if (!eventUrl && !eventTitle) {
      return NextResponse.json({ error: "eventUrl or eventTitle is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
    }

    const analysis = await analyzeWeatherMarket({
      input: {
        eventUrl: eventUrl || undefined,
        eventTitle: eventTitle || undefined,
        riskProfile,
      },
      supabase,
    });

    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json({ error: "Failed to analyze weather market" }, { status: 500 });
  }
}

function normalizeRiskProfile(value: unknown): RiskProfile {
  if (value === "Conservative" || value === "Balanced" || value === "Aggressive") return value;
  return "Balanced";
}
