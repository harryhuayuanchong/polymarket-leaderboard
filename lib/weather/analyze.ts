import { getOrCreateWeatherAiSummary } from "./ai";
import { fetchForecastForMarket } from "./forecast";
import { computeEdge, computeEvNet, deriveSignal, evaluateGates, probabilityForThreshold } from "./math";
import { fetchMarketCandidate } from "./polymarket";
import { parseThresholdSchema } from "./schema";
import type { AnalysisInput, AnalysisResult } from "./types";

export async function analyzeWeatherMarket(args: {
  input: AnalysisInput;
  supabase: any;
}): Promise<AnalysisResult> {
  const { input, supabase } = args;
  const market = await fetchMarketCandidate({ eventTitle: input.eventTitle, eventUrl: input.eventUrl });

  if (!market) {
    return {
      id: null,
      status: "error",
      reason: "Could not resolve a Polymarket weather market from provided URL/title.",
      signal: "NO_TRADE",
      riskProfile: input.riskProfile,
      eventTitle: input.eventTitle || "Unknown event",
      marketQuestion: "",
      schema: { support: "unsupported", side: null, thresholdF: null, reason: "Market not found" },
      market: { price: 0, liquidity: 0, closeTime: null },
      forecast: { locationName: null, targetDate: null, temperatureF: null, sigmaF: null },
      metrics: { pModel: null, edge: null, evNet: null },
      gates: {
        liquidityOk: false,
        closeTimeOk: false,
        edgeOk: false,
        sigmaOk: false,
        supportedSchema: false,
      },
      aiSummary: "Analysis failed because no matching market was found.",
      snapshots: { market: {}, forecast: {} },
    };
  }

  const schema = parseThresholdSchema(market.question);
  if (schema.support === "unsupported" || !schema.side || schema.thresholdF === null) {
    const rowId = await persistWeatherMarket(supabase, {
      source_market_id: market.marketId,
      source_event_id: market.eventId,
      event_title: market.eventTitle,
      event_url: input.eventUrl || market.url,
      market_question: market.question,
      schema_side: null,
      threshold_f: null,
      close_time: market.closeTime,
      price: market.price,
      liquidity: market.liquidity,
      risk_profile: input.riskProfile,
      signal: "NO_TRADE",
      status: "unsupported",
      unsupported_reason: schema.reason || "Unsupported schema",
      gates: {
        supportedSchema: false,
        liquidityOk: false,
        closeTimeOk: false,
        edgeOk: false,
        sigmaOk: false,
      },
      market_snapshot: market.raw,
      forecast_snapshot: {},
    });

    return {
      id: rowId,
      status: "unsupported",
      reason: schema.reason,
      signal: "NO_TRADE",
      riskProfile: input.riskProfile,
      eventTitle: market.eventTitle,
      marketQuestion: market.question,
      schema,
      market: { price: market.price, liquidity: market.liquidity, closeTime: market.closeTime },
      forecast: { locationName: null, targetDate: null, temperatureF: null, sigmaF: null },
      metrics: { pModel: null, edge: null, evNet: null },
      gates: {
        supportedSchema: false,
        liquidityOk: false,
        closeTimeOk: false,
        edgeOk: false,
        sigmaOk: false,
      },
      aiSummary: schema.reason || "Unsupported market format.",
      snapshots: { market: market.raw, forecast: {} },
    };
  }

  const forecast = await fetchForecastForMarket(`${market.eventTitle} ${market.question}`);
  if (!forecast) {
    return {
      id: null,
      status: "error",
      reason: "Unable to fetch weather forecast for this market.",
      signal: "NO_TRADE",
      riskProfile: input.riskProfile,
      eventTitle: market.eventTitle,
      marketQuestion: market.question,
      schema,
      market: { price: market.price, liquidity: market.liquidity, closeTime: market.closeTime },
      forecast: { locationName: null, targetDate: null, temperatureF: null, sigmaF: null },
      metrics: { pModel: null, edge: null, evNet: null },
      gates: {
        supportedSchema: true,
        liquidityOk: false,
        closeTimeOk: false,
        edgeOk: false,
        sigmaOk: false,
      },
      aiSummary: "Forecast could not be loaded.",
      snapshots: { market: market.raw, forecast: {} },
    };
  }

  const sigma = await resolveSigma(supabase, forecast.locationKey);
  const pModel = probabilityForThreshold(schema.side, schema.thresholdF, forecast.temperatureF, sigma);
  const edge = pModel === null ? null : computeEdge(pModel, market.price);
  const evNet = pModel === null ? null : computeEvNet(pModel, market.price, input.riskProfile);
  const gates = evaluateGates({
    riskProfile: input.riskProfile,
    liquidity: market.liquidity,
    closeTime: market.closeTime,
    edge: edge ?? -1,
    sigmaF: sigma,
    isSchemaSupported: true,
  });
  const signal = deriveSignal(gates, evNet);

  const summaryPayload = {
    eventTitle: market.eventTitle,
    question: market.question,
    riskProfile: input.riskProfile,
    signal,
    marketPrice: market.price,
    forecastTempF: forecast.temperatureF,
    thresholdF: schema.thresholdF,
    side: schema.side,
    sigmaF: sigma,
    pModel,
    edge,
    evNet,
    gates,
  } as Record<string, unknown>;

  const ai = await getOrCreateWeatherAiSummary({
    supabase,
    payload: summaryPayload,
  });

  const rowId = await persistWeatherMarket(supabase, {
    source_market_id: market.marketId,
    source_event_id: market.eventId,
    event_title: market.eventTitle,
    event_url: input.eventUrl || market.url,
    market_question: market.question,
    schema_side: schema.side,
    threshold_f: schema.thresholdF,
    location_name: forecast.locationName,
    location_key: forecast.locationKey,
    target_date: forecast.targetDate,
    close_time: market.closeTime,
    price: market.price,
    liquidity: market.liquidity,
    forecast_temp_f: forecast.temperatureF,
    forecast_source: forecast.source,
    sigma_f: sigma,
    risk_profile: input.riskProfile,
    p_model: pModel,
    edge,
    ev_net: evNet,
    gates,
    signal,
    status: "ok",
    ai_summary_id: ai.id,
    market_snapshot: market.raw,
    forecast_snapshot: forecast.raw,
  });

  return {
    id: rowId,
    status: "ok",
    signal,
    riskProfile: input.riskProfile,
    eventTitle: market.eventTitle,
    marketQuestion: market.question,
    schema,
    market: { price: market.price, liquidity: market.liquidity, closeTime: market.closeTime },
    forecast: {
      locationName: forecast.locationName,
      targetDate: forecast.targetDate,
      temperatureF: forecast.temperatureF,
      sigmaF: sigma,
    },
    metrics: {
      pModel,
      edge,
      evNet,
    },
    gates,
    aiSummary: ai.summary,
    snapshots: {
      market: market.raw,
      forecast: forecast.raw,
    },
  };
}

async function resolveSigma(supabase: any, locationKey: string) {
  const direct = await supabase
    .from("forecast_sigma")
    .select("sigma_f")
    .eq("location_key", locationKey)
    .maybeSingle();

  if (typeof direct.data?.sigma_f === "number") return direct.data.sigma_f;

  const fallback = await supabase
    .from("forecast_sigma")
    .select("sigma_f")
    .eq("location_key", "default")
    .maybeSingle();

  return typeof fallback.data?.sigma_f === "number" ? fallback.data.sigma_f : 4.5;
}

async function persistWeatherMarket(supabase: any, payload: Record<string, unknown>) {
  const response = await supabase
    .from("weather_markets")
    .insert({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return response.data?.id || null;
}
