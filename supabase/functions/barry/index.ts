// Barry — the Cadence assistant (Supabase Edge Function).
//
// POST /functions/v1/barry
//   Authorization: Bearer <anon or user key>
//   Body: { messages: [{role, content}], child_context: {name?, ageWeeks?, ageLabel?, birth_date?, recentSummary?} }
//   Response: OpenAI-style SSE stream of chat completion deltas.
//
// Pipeline:
//   1. Retrieve relevant notes from `barry_corpus` — vector search when
//      embeddings are configured (BARRY_EMBEDDING_MODEL), keyword search otherwise.
//   2. Web-search the question via SearXNG (BARRY_SEARXNG_URL; defaults to
//      the `searxng` service of this compose stack at http://searxng:8080).
//   3. Build a system prompt from the notes, the web results and the child's context.
//   4. Stream the completion from a configurable OpenAI-compatible endpoint.
//
// Secrets (set with `supabase secrets set`):
//   BARRY_BASE_URL        e.g. https://api.openai.com/v1  (any OpenAI-compatible)
//   BARRY_API_KEY         API key for that endpoint
//   BARRY_MODEL           e.g. gpt-4o-mini
//   BARRY_SEARXNG_URL     optional SearXNG base URL for web search + citations;
//                         defaults to http://searxng:8080 (this stack's searxng
//                         service). If it is unreachable, Barry falls back to
//                         notes + recorded data and says so.
//   BARRY_EMBEDDING_MODEL optional, e.g. text-embedding-3-small (384-dim rows
//                         are expected for the seed corpus; if your embedding
//                         model uses a different dimension, drop/recreate the
//                         `embedding vector(384)` column accordingly)
//
// The endpoint can be OpenAI, Groq, Together, or a local server (Ollama,
// LM Studio, vLLM). Without BARRY_BASE_URL / BARRY_API_KEY the function
// returns a 503 telling you to configure it.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Kept short and numbered: Barry runs on small local models, which follow
// terse "if X, do Y" rules far better than long prose with nested clauses.
const SYSTEM_BASE = `You are Barry, the friendly assistant inside Cadence, a baby care tracker. You only talk about babies and this caregiver's child.

Rules:
1. Interpret vague questions about the baby, using the child's age and the recorded data below. Example: "what can I expect to see this week?" means the baby's feeding, sleep and development at their age — not the night sky.
2. Web results are raw keyword matches, often about unrelated topics. Check each result's title first: use it only if it is clearly about babies or childcare. Ignore the rest.
3. Do not invent facts, dosages or numbers. If nothing below covers the question, say so in one line and suggest what to track or whom to ask.
4. If a question is too vague to answer well, ask one short clarifying question about the baby.
5. Never diagnose, prescribe or advise starting or stopping medication. Cadence is a care tracker, not a medical service. For medical judgment, tell them to ask their own doctor.
6. If asked about the app itself (name, purpose, features), answer from who you are: Barry, the assistant inside Cadence, a local-first baby care tracker.
7. Be warm, concise and practical: short paragraphs or bullets, in the caregiver's language.
8. Markdown only: bold, bullets, short paragraphs. No raw HTML.
9. If you used web results, end with one line: Sources: [Title](url) (max 3 links).
10. If the topic is health, end with one line: general information, not medical advice.`;

async function embedText(text: string, model: string): Promise<number[] | null> {
  const base = Deno.env.get("BARRY_BASE_URL");
  const key = Deno.env.get("BARRY_API_KEY");
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: [text] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const v = j?.data?.[0]?.embedding;
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Fill in missing embeddings for corpus rows (best effort, at most 20 at a time)
 * so that the first vector search works without a separate indexing step.
 */
async function topUpEmbeddings(supabase: any, model: string): Promise<void> {
  const { data: missing } = await supabase
    .from("barry_corpus")
    .select("id, topic, title, body")
    .is("embedding", null)
    .limit(20);
  if (!missing || missing.length === 0) return;

  const base = Deno.env.get("BARRY_BASE_URL");
  const key = Deno.env.get("BARRY_API_KEY");
  if (!base || !key) return;

  const texts = missing.map(
    (r: any) => `${r.topic}\n${r.title}\n${r.body}`,
  );
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) return;
    const j = await res.json();
    for (const [i, row] of missing.entries()) {
      const v = j?.data?.[i]?.embedding;
      if (Array.isArray(v)) {
        await supabase.from("barry_corpus").update({ embedding: v }).eq("id", row.id);
      }
    }
  } catch {
    /* embeddings are optional; keyword search remains as fallback */
  }
}

/**
 * Web search via a SearXNG instance (JSON API). Returns at most `n`
 * results, each with a short content snippet. Any failure (missing or slow
 * SearXNG, bad response) returns [] — Barry then degrades to notes +
 * recorded data instead of erroring.
 */
async function webSearch(
  base: string,
  query: string,
  n = 5,
): Promise<{ title: string; url: string; content: string }[]> {
  try {
    const url =
      `${base.replace(/\/$/, "")}/search?format=json&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const j: any = await res.json();
    const results: any[] = Array.isArray(j?.results) ? j.results : [];
    return results
      .slice(0, n)
      .map((r) => ({
        title: String(r?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 150),
        url: String(r?.url ?? ""),
        content: String(r?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
      }))
      .filter((r) => r.url);
  } catch {
    return [];
  }
}

/** Vector search with keyword fallback. */
async function retrieve(
  supabase: any,
  query: string,
  model: string | null,
): Promise<{ id: number; topic: string; title: string; body: string }[]> {
  if (model) {
    const qv = await embedText(query, model);
    if (qv) {
      const { data, error } = await supabase.rpc("barry_search", {
        query_embedding: qv,
        top_k: 4,
      });
      if (!error && data && data.length) return data;
    }
  }
  // Keyword fallback: score rows by term overlap in title/body/topic.
  const { data: rows } = await supabase.from("barry_corpus").select("id, topic, title, body");
  if (!rows) return [];
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const scored = rows.map((r: any) => {
    const text = `${r.topic} ${r.title} ${r.body}`.toLowerCase();
    let score = 0;
    for (const t of terms) if (text.includes(t)) score += 1;
    return { r, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.r);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Use POST");

  const baseUrl = Deno.env.get("BARRY_BASE_URL");
  const apiKey = Deno.env.get("BARRY_API_KEY");
  const model = Deno.env.get("BARRY_MODEL") || "gpt-4o-mini";
  const embedModel = Deno.env.get("BARRY_EMBEDDING_MODEL") || null;
  const searxngBase = Deno.env.get("BARRY_SEARXNG_URL") || "http://searxng:8080";

  if (!baseUrl || !apiKey) {
    return jsonError(
      503,
      "Barry is not configured yet. Set the BARRY_BASE_URL, BARRY_API_KEY and BARRY_MODEL secrets on the `barry` edge function (any OpenAI-compatible endpoint).",
    );
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "Body must be JSON");
  }
  const messages: { role: string; content: string }[] = payload?.messages ?? [];
  const ctx = payload?.child_context ?? {};
  if (!messages.length) return jsonError(400, "messages is required");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const query = lastUser?.content ?? "";

  // Retrieval (embeddings are optional; top-up runs quietly in the background).
  if (embedModel) void topUpEmbeddings(supabase, embedModel);
  const notes = await retrieve(supabase, query, embedModel);
  const web = await webSearch(searxngBase, query);

  const childLines: string[] = [];
  if (ctx.name) childLines.push(`Child: ${ctx.name}`);
  if (ctx.ageLabel || typeof ctx.ageWeeks === "number") {
    const age = [
      ctx.ageLabel,
      typeof ctx.ageWeeks === "number" ? `(${ctx.ageWeeks} weeks)` : "",
    ]
      .filter(Boolean)
      .join(" ");
    childLines.push(`Age: ${age}`);
  }
  if (ctx.birth_date) childLines.push(`Born: ${ctx.birth_date}`);
  if (ctx.recentSummary) childLines.push(`Recorded data (recent):\n${ctx.recentSummary}`);
  const childLine = childLines.join("\n");

  const systemPrompt = [
    SYSTEM_BASE,
    "",
    "=== REFERENCE NOTES ===",
    notes.length
      ? notes.map((n) => `[${n.topic}] ${n.title}\n${n.body}`).join("\n\n")
      : "(no matching notes — rely on the web search results and the recorded data)",
    "",
    "=== WEB SEARCH RESULTS ===",
    web.length
      ? web.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.content}`).join("\n\n")
      : "(web search returned nothing — answer only from the notes and recorded data)",
    "",
    "=== CAREGIVER CONTEXT ===",
    childLine || "(no child context)",
  ].join("\n");

  const llmMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: llmMessages, stream: true }),
      signal: req.signal,
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      return jsonError(502, `Upstream LLM error (${res.status}): ${detail.slice(0, 300)}`);
    }

    // Pass the SSE stream straight through to the client.
    return new Response(res.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return jsonError(502, `Could not reach the LLM endpoint: ${String(err)}`);
  }
});
