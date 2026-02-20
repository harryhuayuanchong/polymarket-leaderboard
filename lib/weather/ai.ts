import { createHash } from "node:crypto";

export async function getOrCreateWeatherAiSummary(args: {
  supabase: any;
  payload: Record<string, unknown>;
}) {
  const cacheKey = hashPayload(args.payload);

  const cached = await args.supabase
    .from("ai_summaries")
    .select("id,summary,source,updated_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached.data?.summary) {
    return {
      id: cached.data.id,
      summary: cached.data.summary,
      source: cached.data.source,
      updatedAt: cached.data.updated_at,
      cached: true,
    };
  }

  const modelSummary = await generateModelSummary(args.payload);
  const summary = modelSummary ?? buildRuleBasedSummary(args.payload);
  const source = modelSummary ? "model" : "rule_based";

  const inserted = await args.supabase
    .from("ai_summaries")
    .upsert(
      {
        cache_key: cacheKey,
        summary,
        source,
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        payload: args.payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" }
    )
    .select("id")
    .single();

  let summaryId = inserted.data?.id || null;
  if (!summaryId) {
    const refetched = await args.supabase
      .from("ai_summaries")
      .select("id")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    summaryId = refetched.data?.id || null;
  }

  return {
    id: summaryId,
    summary,
    source,
    updatedAt: new Date().toISOString(),
    cached: false,
  };
}

async function generateModelSummary(payload: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const prompt = `
Write a compact trading report in plain text with exactly these section headers:
Executive Summary:
Model View:
Risk Check:
Trade Plan:

Rules:
- Include concrete numbers from payload (probability, price, edge, EV, signal).
- If edge or EV is negative, Trade Plan should explicitly say avoid or wait.
- If gates fail, mention the failed gate names.
- Keep each section to one short paragraph.
- No markdown bullets or tables.

Payload:
${JSON.stringify(payload)}
  `.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 220,
      messages: [
        { role: "system", content: "You are a concise quantitative weather market analyst." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) return null;

  const json = await response.json();
  const content = readModelContent(json);
  if (!content) return null;
  return normalizeSummary(content);
}

function buildRuleBasedSummary(payload: Record<string, unknown>) {
  const signal = String(payload.signal || "NO_TRADE");
  const edge = Number(payload.edge || 0);
  const evNet = Number(payload.evNet || 0);
  const pModel = Number(payload.pModel || 0);
  const marketPrice = Number(payload.marketPrice || 0);
  const gates = (payload.gates || {}) as Record<string, boolean>;
  const failedGates = Object.entries(gates)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  return [
    `Executive Summary: ${signal}. Model ${(pModel * 100).toFixed(2)}% vs market ${(marketPrice * 100).toFixed(2)}%.`,
    `Model View: Edge ${(edge * 100).toFixed(2)} pts and EV net ${(evNet * 100).toFixed(2)} pts.`,
    `Risk Check: ${failedGates.length > 0 ? `Failed gates ${failedGates.join(", ")}.` : "No gate failures detected."}`,
    `Trade Plan: ${evNet > 0 && edge > 0 ? "Take only with stable gates and disciplined sizing." : "Stand down for now and re-check after the next forecast update."}`,
  ].join("\n\n");
}

function hashPayload(payload: Record<string, unknown>) {
  const value = JSON.stringify(payload);
  return createHash("sha256").update(value).digest("hex");
}

function readModelContent(json: any) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((item: any) => (typeof item?.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
    return text || null;
  }
  return null;
}

function normalizeSummary(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (lines.length === 0) return text;
  return lines.join("\n\n");
}
