export function buildFallbackSummaryFromRow(row: {
  signal: string;
  risk_profile?: string | null;
  p_model?: number | null;
  price?: number | null;
  edge?: number | null;
  ev_net?: number | null;
  gates?: Record<string, boolean> | null;
  unsupported_reason?: string | null;
}) {
  if (row.unsupported_reason) return row.unsupported_reason;

  const pModel = numberOrNull(row.p_model);
  const price = numberOrNull(row.price);
  const edge = numberOrNull(row.edge);
  const evNet = numberOrNull(row.ev_net);
  const gates = row.gates || {};
  const failed = Object.entries(gates)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)
    .join(", ");

  const core =
    pModel !== null && price !== null
      ? `Signal ${row.signal}. Model ${(pModel * 100).toFixed(2)}% vs market ${(price * 100).toFixed(2)}%.`
      : `Signal ${row.signal}.`;

  const evPart =
    edge !== null && evNet !== null
      ? `Edge ${(edge * 100).toFixed(2)} pts, EV net ${(evNet * 100).toFixed(2)} pts for ${row.risk_profile || "selected"} risk.`
      : "Insufficient metrics to compute edge and EV.";

  const gatesPart = failed ? `Failed gates: ${failed}.` : "All configured gates passed.";

  return `${core} ${evPart} ${gatesPart}`;
}

export function explainMetric(label: string) {
  const map: Record<string, string> = {
    "Market Price": "Implied probability from Polymarket price.",
    "Model Probability": "Probability estimated by forecast mean and sigma.",
    Edge: "Model probability minus market price. Positive means potential value.",
    "EV Net": "Expected value after estimated fees/slippage for selected risk profile.",
    "Forecast Temp": "Forecast central estimate used for probability model.",
    Sigma: "Forecast uncertainty (higher means wider outcomes).",
  };
  return map[label] || "";
}

export function explainGate(key: string) {
  const map: Record<string, string> = {
    liquidityOk: "Market liquidity meets risk-profile minimum.",
    closeTimeOk: "Enough time remains before market close.",
    edgeOk: "Edge exceeds risk-profile minimum threshold.",
    sigmaOk: "Forecast uncertainty value is available and valid.",
    supportedSchema: "Market schema is parseable by current model rules.",
  };
  return map[key] || "Gate check";
}

function numberOrNull(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? null : n;
}
