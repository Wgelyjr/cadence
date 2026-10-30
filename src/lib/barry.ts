import { isSupabaseConfigured, supabaseConfig } from './config';
import type { BarryChildContext, BarryMessage } from './types';

/**
 * Call Barry (the Supabase edge function) and yield streamed text deltas.
 *
 * The edge function does the RAG (retrieval over the curated corpus) and the
 * LLM call against a configurable OpenAI-compatible endpoint, so API keys
 * never reach the browser.
 */
export async function* askBarry(
  messages: BarryMessage[],
  childContext: BarryChildContext,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const { url, anonKey } = supabaseConfig;
  if (!isSupabaseConfigured || !url || !anonKey) {
    throw new Error(
      'Barry needs a backend to run. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, deploy the `barry` edge function, and configure its secrets to enable it.',
    );
  }

  const res = await fetch(`${url}/functions/v1/barry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ messages, child_context: childContext }),
    signal,
  });

  if (!res.ok || !res.body) {
    let msg = `Barry request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }

  yield* sseToText(res);
}

/** Parse an OpenAI-style SSE stream into text deltas. */
async function* sseToText(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '').trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const delta =
            json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.text ?? '';
          if (delta) yield delta;
        } catch {
          /* keep-alive or non-JSON line — ignore */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
