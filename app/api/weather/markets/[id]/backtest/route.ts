import { NextResponse } from "next/server";
import { buildBacktestSummary, type BacktestRow } from "../../../../../../lib/weather/backtest";
import { getSupabaseAdmin } from "../../../../../../lib/weather/supabase";

type CurrentRow = {
  id: string;
  schema_side: string | null;
  location_key: string | null;
};

export async function GET(_request: Request, context: { params: { id: string } }) {
  const id = context.params.id;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const current = await supabase
    .from("weather_markets")
    .select("id,schema_side,location_key")
    .eq("id", id)
    .maybeSingle<CurrentRow>();

  if (current.error || !current.data) {
    return NextResponse.json({ error: "Failed to load baseline market" }, { status: 404 });
  }

  let query = supabase
    .from("weather_markets")
    .select("id,event_title,market_question,risk_profile,signal,price,p_model,edge,ev_net,created_at")
    .neq("id", id)
    .eq("status", "ok")
    .not("p_model", "is", null)
    .order("created_at", { ascending: false })
    .limit(120);

  if (current.data.schema_side) {
    query = query.eq("schema_side", current.data.schema_side);
  }

  if (current.data.location_key) {
    query = query.eq("location_key", current.data.location_key);
  }

  const result = await query;
  if (result.error) {
    return NextResponse.json({ error: "Failed to load backtest rows" }, { status: 500 });
  }

  const rows = (result.data || []) as BacktestRow[];
  const summary = buildBacktestSummary(rows);

  return NextResponse.json({
    baselineId: id,
    summary,
    rows,
  });
}
