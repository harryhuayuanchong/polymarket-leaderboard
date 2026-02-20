export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

export type WeatherSchemaSide = "HIGH_GTE" | "HIGH_LTE" | "LOW_GTE" | "LOW_LTE";

export type MarketSupport = "supported" | "unsupported";

export type WeatherSignal = "PASS" | "WATCH" | "NO_TRADE";

export type WeatherGateResult = {
  liquidityOk: boolean;
  closeTimeOk: boolean;
  edgeOk: boolean;
  sigmaOk: boolean;
  supportedSchema: boolean;
};

export type ParsedMarketSchema = {
  support: MarketSupport;
  side: WeatherSchemaSide | null;
  thresholdF: number | null;
  reason?: string;
};

export type PolymarketMarket = {
  marketId: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string | null;
  question: string;
  price: number;
  liquidity: number;
  closeTime: string | null;
  url: string | null;
  imageUrl: string | null;
  raw: Record<string, unknown>;
};

export type ForecastResult = {
  locationName: string;
  locationKey: string;
  latitude: number;
  longitude: number;
  targetDate: string;
  temperatureF: number;
  source: string;
  raw: Record<string, unknown>;
};

export type AnalysisInput = {
  eventUrl?: string;
  eventTitle?: string;
  riskProfile: RiskProfile;
};

export type AnalysisResult = {
  id: string | null;
  status: "ok" | "unsupported" | "error";
  reason?: string;
  signal: WeatherSignal;
  riskProfile: RiskProfile;
  eventTitle: string;
  marketQuestion: string;
  schema: ParsedMarketSchema;
  market: {
    price: number;
    liquidity: number;
    closeTime: string | null;
  };
  forecast: {
    locationName: string | null;
    targetDate: string | null;
    temperatureF: number | null;
    sigmaF: number | null;
  };
  metrics: {
    pModel: number | null;
    edge: number | null;
    evNet: number | null;
  };
  gates: WeatherGateResult;
  aiSummary: string;
  snapshots: {
    market: Record<string, unknown>;
    forecast: Record<string, unknown>;
  };
};
