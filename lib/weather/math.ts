import type { WeatherGateResult, WeatherSignal, WeatherSchemaSide } from "./types";

const PROFILE_CONFIG = {
  Conservative: { minLiquidity: 5000, minEdge: 0.04, feeRate: 0.02, minHoursToClose: 10 },
  Balanced: { minLiquidity: 2000, minEdge: 0.02, feeRate: 0.015, minHoursToClose: 6 },
  Aggressive: { minLiquidity: 800, minEdge: 0.005, feeRate: 0.01, minHoursToClose: 2 },
} as const;

export function probabilityForThreshold(
  side: WeatherSchemaSide,
  thresholdF: number,
  meanF: number,
  sigmaF: number
) {
  if (sigmaF <= 0) return null;
  const z = (thresholdF - meanF) / sigmaF;
  if (side === "HIGH_GTE" || side === "LOW_GTE") {
    return clamp01(1 - normalCdf(z));
  }
  return clamp01(normalCdf(z));
}

export function computeEdge(pModel: number, price: number) {
  return pModel - price;
}

export function computeEvNet(pModel: number, price: number, riskProfile: keyof typeof PROFILE_CONFIG) {
  const fee = PROFILE_CONFIG[riskProfile].feeRate;
  const gross = pModel * (1 - price) - (1 - pModel) * price;
  return gross - fee;
}

export function evaluateGates(args: {
  riskProfile: keyof typeof PROFILE_CONFIG;
  liquidity: number;
  closeTime: string | null;
  edge: number;
  sigmaF: number | null;
  isSchemaSupported: boolean;
}): WeatherGateResult {
  const cfg = PROFILE_CONFIG[args.riskProfile];
  const closeHours = hoursUntilClose(args.closeTime);

  return {
    liquidityOk: args.liquidity >= cfg.minLiquidity,
    closeTimeOk: closeHours === null ? false : closeHours >= cfg.minHoursToClose,
    edgeOk: args.edge >= cfg.minEdge,
    sigmaOk: args.sigmaF !== null && args.sigmaF > 0,
    supportedSchema: args.isSchemaSupported,
  };
}

export function deriveSignal(gates: WeatherGateResult, evNet: number | null): WeatherSignal {
  const gateValues = Object.values(gates);
  if (gateValues.every(Boolean) && evNet !== null && evNet > 0) return "PASS";
  if (gates.supportedSchema && gates.sigmaOk) return "WATCH";
  return "NO_TRADE";
}

export function profileConfig(profile: keyof typeof PROFILE_CONFIG) {
  return PROFILE_CONFIG[profile];
}

function hoursUntilClose(closeTime: string | null) {
  if (!closeTime) return null;
  const close = new Date(closeTime).getTime();
  if (Number.isNaN(close)) return null;
  return (close - Date.now()) / 3_600_000;
}

function normalCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let p =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
