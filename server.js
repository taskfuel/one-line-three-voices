// One line, three voices, three prices.
//
// The same sentence goes to three text-to-speech engines at once. Every call
// goes through the TaskFuel gateway, which pays the upstream and bills your
// prepaid balance. You need one key, not three provider accounts.
// Docs: https://app.taskfuel.ai/building-apps.md

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = process.env.PORT || 3000;
const KEY = process.env.TASKFUEL_API_KEY;
const GATEWAY = "https://app.taskfuel.ai/v1/call";

// Long enough for a line of ad copy. ElevenLabs charges by the character, so
// this also keeps its price under MAX_USD_PER_VOICE.
const MAX_CHARS = 200;

// The three engines the blog post read the same line with. They disagree on
// almost everything: the field the text goes in, how a voice is picked, and
// what comes back. `body` builds each one's request, `audio` finds the sound
// in its response.
const VOICES = [
  {
    id: "grok",
    label: "Grok",
    voice: "ara",
    url: "https://grok.mpp.paywithlocus.com/grok/tts",
    // Reads inline tags too: [pause], [laugh], <whisper>text</whisper>.
    body: (text) => ({ text, language: "en", voice_id: "ara" }),
    // Base64 MP3 inside the response.
    audio: (data) => data?.data?.data && `data:audio/mpeg;base64,${data.data.data}`,
    sample: "voice-grok.mp3",
    samplePrice: 0.002,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs v3",
    voice: "george",
    url: "https://blockrun.ai/api/v1/audio/speech",
    // "input", not "text", and the price scales with its length.
    body: (text) => ({ input: text, model: "elevenlabs/v3", voice: "george" }),
    // A hosted MP3 rather than the audio itself.
    audio: (data) => data?.data?.[0]?.url,
    sample: "voice-elevenlabs.mp3",
    samplePrice: 0.012,
  },
  {
    id: "deepgram",
    label: "Deepgram Aura-2",
    voice: "thalia",
    url: "https://deepgram.mpp.paywithlocus.com/deepgram/speak",
    body: (text) => ({ text, model: "aura-2-thalia-en" }),
    audio: (data) => data?.data?.data && `data:audio/mpeg;base64,${data.data.data}`,
    sample: "voice-deepgram.mp3",
    samplePrice: 0.023,
  },
];

// What the page plays before anyone has spent anything: the blog post's own
// recordings of the default line.
const SAMPLE_BASE = "https://taskfuel.ai/audio/blog/audio-and-music-apis-for-ai-agents/";

// Guardrails. The key can spend the whole balance and nobody is watching at
// call time, so the limits live in the code. See "Spending safely" in
// https://app.taskfuel.ai/building-apps.md
const MAX_USD_PER_VOICE = Number(process.env.MAX_USD_PER_VOICE || 0.03);
const DAILY_BUDGET_USD = Number(process.env.DAILY_BUDGET_USD || 1.0);

let spentToday = 0;
let budgetDay = new Date().toISOString().slice(0, 10);

function budgetLeft() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== budgetDay) {
    budgetDay = today;
    spentToday = 0;
  }
  return DAILY_BUDGET_USD - spentToday;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Call through the gateway. Returns the upstream body plus what it charged. */
async function gateway({ url, method = "POST", body, maxAmountUsd }) {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, method, body, maxAmountUsd }),
  });

  // The charge and the new balance travel in headers. The body is the
  // upstream's own response, passed through untouched.
  const cost = Number(res.headers.get("x-taskfuel-cost") || 0);
  const balance = res.headers.get("x-taskfuel-balance");
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const detail = data?.error || data?.message || text.slice(0, 200);
    const err = new Error(`gateway ${res.status}: ${detail}`);
    err.status = res.status;
    // The gateway tells you how long to wait. Honour it rather than guessing.
    err.retryAfterSeconds = Number(data?.retry_after_seconds) || 10;
    throw err;
  }
  return { data, cost, balance };
}

/** Retry only on 429, which is free: the gateway rate-limits before it pays. */
async function withRetry(call) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (err.status !== 429 || attempt >= 2) throw err;
      await sleep(err.retryAfterSeconds * 1000);
    }
  }
}

/** Paid: read one line in one voice. Takes a couple of seconds. */
async function speak(voice, text) {
  if (budgetLeft() < MAX_USD_PER_VOICE) {
    throw new Error(
      `daily budget of $${DAILY_BUDGET_USD.toFixed(2)} reached. Raise DAILY_BUDGET_USD to continue.`,
    );
  }

  const result = await withRetry(() =>
    gateway({ url: voice.url, body: voice.body(text), maxAmountUsd: MAX_USD_PER_VOICE }),
  );

  spentToday += result.cost;

  // Paid for either way, so say what it cost even when the audio is missing.
  const audio = voice.audio(result.data);
  if (!audio) {
    throw new Error(
      `charged $${result.cost.toFixed(4)} but no audio came back: ${JSON.stringify(result.data).slice(0, 160)}`,
    );
  }

  return { audio, cost: result.cost, balance: result.balance, spentToday, budget: DAILY_BUDGET_USD };
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function handle(req, res) {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const html = await readFile(new URL("./public/index.html", import.meta.url));
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(html);
  }

  if (req.method === "GET" && req.url === "/api/config") {
    return json(res, 200, {
      voices: VOICES.map(({ id, label, voice, sample, samplePrice }) => ({
        id,
        label,
        voice,
        sample: SAMPLE_BASE + sample,
        samplePrice,
      })),
      maxChars: MAX_CHARS,
      hasKey: Boolean(KEY),
    });
  }

  if (req.method === "POST" && req.url === "/api/speak") {
    if (!KEY) {
      return json(res, 500, {
        error: "No TASKFUEL_API_KEY set. Add it as a secret, then start the app again.",
      });
    }

    let payload = "";
    for await (const chunk of req) payload += chunk;

    let text, id;
    try {
      ({ text, voice: id } = JSON.parse(payload));
    } catch {
      return json(res, 400, { error: "bad JSON" });
    }

    const voice = VOICES.find((v) => v.id === id);
    if (!voice) return json(res, 400, { error: `unknown voice: ${id}` });
    text = text?.trim();
    if (!text) return json(res, 400, { error: "text is required" });
    if (text.length > MAX_CHARS) {
      return json(res, 400, { error: `keep it to ${MAX_CHARS} characters` });
    }

    try {
      return json(res, 200, await speak(voice, text));
    } catch (err) {
      return json(res, 502, { error: String(err.message || err) });
    }
  }

  res.writeHead(404);
  res.end("not found");
}

const server = createServer((req, res) => {
  req.on("error", () => {});
  res.on("error", () => {});

  handle(req, res).catch((err) => {
    if (err?.code === "ECONNRESET" || err?.message === "aborted") return; // client went away
    console.error("request failed:", err?.message || err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal error" }));
    }
  });
});

server.on("clientError", (_err, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

process.on("unhandledRejection", (err) => {
  console.error("unhandled rejection:", err?.message || err);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Voice lineup running on port ${PORT}`);
  if (!KEY) {
    console.log("  No TASKFUEL_API_KEY yet. Add it as a secret, then start the app again.");
    console.log("  On Replit: the Agent asks for it, or add it in the Secrets tool.");
    console.log("  Get a key at https://app.taskfuel.ai (first $5 is free).\n");
  } else {
    console.log(`  Budget: $${DAILY_BUDGET_USD.toFixed(2)}/day, $${MAX_USD_PER_VOICE.toFixed(2)} max per voice\n`);
  }
});
