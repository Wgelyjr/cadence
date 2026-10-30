// Barry — the BabyApp assistant (Supabase Edge Function).
//
// POST /functions/v1/barry
//   Authorization: Bearer <anon or user key>
//   Body: { messages: [{role, content}], child_context: {name?, ageWeeks?, recentSummary?} }
//   Response: OpenAI-style SSE stream of chat completion deltas.
//
// Pipeline:
//   1. Retrieve relevant notes from `barry_corpus` — vector search when
//      embeddings are configured (BARRY_EMBEDDING_MODEL), keyword search otherwise.
//   2. Build a system prompt from the retrieved notes + the child's context.
//   3. Stream the completion from a configurable OpenAI-compatible endpoint.
//
// Secrets (set with `supabase secrets set`):
//   BARRY_BASE_URL        e.g. https://api.openai.com/v1  (any OpenAI-compatible)
//   BARRY_API_KEY         API key for that endpoint
//   BARRY_MODEL           e.g. gpt-4o-mini
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

const SYSTEM_BASE = `You are Barry, the friendly assistant inside BabyApp, a baby care tracker.

Ground rules:
- You answer ONLY from: (a) the reference notes provided below, and (b) the caregiver's own recorded data summary provided below. Do not invent facts, dosages or numbers that are not in those notes.
- BabyApp is a care-tracking tool, NOT a medical service. Never diagnose, prescribe or tell a caregiver to start/stop any medication. If a question needs medical judgment, say clearly that they should talk to their own doctor or a health professional.
- End answers with a one-line reminder that this is general information, not medical advice, only when the topic is health-related.
- Be warm, concise and practical. Use short paragraphs or bullets. Match the caregiver's language.
- Format your answer in GitHub-flavoured markdown: use **bold** for key points, bullet lists for steps or signs, and short paragraphs. The app renders markdown, so do not use raw HTML.
- If the notes do not cover the question, say so plainly and suggest what to track or whom to ask.`;

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

  const childLine = [
    ctx.name && `Child: ${ctx.name}`,
    typeof ctx.ageWeeks === "number" && `Age: ${ctx.ageWeeks} weeks`,
    ctx.recentSummary && `Recorded data (last 48h): ${ctx.recentSummary}`,
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = [
    SYSTEM_BASE,
    "",
    "=== REFERENCE NOTES ===",
    notes.length
      ? notes.map((n) => `[${n.topic}] ${n.title}\n${n.body}`).join("\n\n")
      : "(no matching notes — answer conservatively from general knowledge of your role, or say the notes don't cover it)",
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
