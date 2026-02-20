import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../lib/weather/supabase";
import { buildFallbackSummaryFromRow } from "../../../../../lib/weather/explain";
import { buildWeatherMarketMeta } from "../../../../../lib/weather/marketMeta";

type WeatherMarketRow = {
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
  ai_summary_id: string | null;
  market_snapshot: Record<string, unknown>;
  forecast_snapshot: Record<string, unknown>;
  created_at: string;
};

export async function GET(_request: Request, context: { params: { id: string } }) {
  const id = context.params.id;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const row = await supabase
    .from("weather_markets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (row.error) {
    return NextResponse.json({ error: "Failed to load weather market" }, { status: 500 });
  }

  if (!row.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let aiSummary = "";
  if (row.data.ai_summary_id) {
    const ai = await supabase
      .from("ai_summaries")
      .select("summary")
      .eq("id", row.data.ai_summary_id)
      .maybeSingle();
    aiSummary = ai.data?.summary || "";
  }

  if (!aiSummary) {
    aiSummary = buildFallbackSummaryFromRow(row.data);
  }

  const meta = await buildWeatherMarketMeta(row.data.market_snapshot);

  return NextResponse.json({ ...row.data, aiSummary, meta });
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const id = context.params.id;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const deleted = await supabase.from("weather_markets").delete().eq("id", id).select("id").maybeSingle();
  if (deleted.error) {
    return NextResponse.json({ error: "Failed to delete weather market analysis" }, { status: 500 });
  }

  if (!deleted.data?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: deleted.data.id });
}
