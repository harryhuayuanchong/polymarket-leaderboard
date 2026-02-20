import { NextResponse } from "next/server";
import { listDefaultWeatherMarkets, searchMarketsByTitle } from "../../../../../lib/weather/polymarket";
import { getSupabaseAdmin } from "../../../../../lib/weather/supabase";

type WeatherMarketRow = {
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)));
  const query = (searchParams.get("q") || "").trim();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const [stored, candidates] = await Promise.all([
    supabase
      .from("weather_markets")
      .select(
        "id,event_title,market_question,risk_profile,signal,status,price,liquidity,close_time,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    query ? searchMarketsByTitle(query, limit) : listDefaultWeatherMarkets(limit),
  ]);

  if (stored.error) {
    return NextResponse.json({ error: "Failed to load weather markets" }, { status: 500 });
  }

  const rows = (stored.data || []) as WeatherMarketRow[];

  return NextResponse.json({
    rows,
    candidates: candidates.map((item) => ({
      sourceMarketId: item.marketId,
      eventTitle: item.eventTitle,
      marketQuestion: item.question,
      price: item.price,
      liquidity: item.liquidity,
      closeTime: item.closeTime,
      eventUrl: item.url,
      imageUrl: item.imageUrl,
    })),
  });
}
