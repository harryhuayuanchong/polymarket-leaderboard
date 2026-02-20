export type BacktestRow = {
  id: string;
  event_title: string;
  market_question: string;
  risk_profile: string;
  signal: string;
  price: number | null;
  p_model: number | null;
  edge: number | null;
  ev_net: number | null;
  created_at: string;
};

export function buildBacktestSummary(rows: BacktestRow[]) {
  const usable = rows.filter((row) => isNumber(row.edge) && isNumber(row.ev_net) && isNumber(row.p_model));

  const passRows = usable.filter((row) => row.signal === "PASS");
  const watchRows = usable.filter((row) => row.signal === "WATCH");

  const total = usable.length;
  const passRate = total > 0 ? passRows.length / total : 0;
  const watchRate = total > 0 ? watchRows.length / total : 0;

  const avgEdge = average(usable.map((row) => row.edge as number));
  const avgEvNet = average(usable.map((row) => row.ev_net as number));
  const avgPModel = average(usable.map((row) => row.p_model as number));
  const hypotheticalReturn = sum(passRows.map((row) => row.ev_net as number));

  return {
    total,
    passRate,
    watchRate,
    avgEdge,
    avgEvNet,
    avgPModel,
    hypotheticalReturn,
  };
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return sum(values) / values.length;
}

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
