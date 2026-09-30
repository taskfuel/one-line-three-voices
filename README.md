# One line, three voices, three prices

[![Run on Replit](https://replit.com/badge/github/taskfuel/one-line-three-voices)](https://replit.com/github.com/taskfuel/one-line-three-voices)

Open it in Replit with one click, add your own key, and write your own line.

Type a sentence once. It goes to Grok, ElevenLabs and Deepgram at the same time,
and you get three reads back, each with what it actually charged. Under four
cents for the set, a couple of seconds each.

| engine | voice | price for one sentence |
|---|---|---|
| Grok | `ara` | $0.0019 |
| ElevenLabs v3 | `george` | $0.0123 |
| Deepgram Aura-2 | `thalia` | $0.023 |

Quoted 2026-09-30 for the 108-character line the app opens with. Grok and
ElevenLabs charge by the character, so a longer line costs more; Deepgram is a
flat price per call. Prices are set by the provider and can change, so the app
shows what each call actually cost, which is the only number that is ever
authoritative.

The point is not the cheapest voice. The most expensive one is not automatically
the right one, and whether you want warm, brisk or authoritative is something
you only find out by listening. Hearing all three costs less than four cents.

Before you add a key, the page plays the three reads of that same line recorded
for the blog post, labelled as samples, so you can hear the difference first.

## Run it

1. **[Open it in Replit](https://replit.com/github.com/taskfuel/one-line-three-voices).**
   That imports this repo into your own account as a runnable copy.
2. **Get a key.** Create an account at [app.taskfuel.ai](https://app.taskfuel.ai/?utm_source=replit&utm_medium=referral&utm_campaign=2026-09-replit-templates&utm_content=one-line-three-voices),
   open **API keys** and create one. The first $5 is on the house, which is
   about 130 runs of this app.
3. **Give it the key.** It needs a secret named `TASKFUEL_API_KEY`. Replit's
   Agent asks for it and stores it for you, or you can add it yourself in the
   Secrets tool.
4. **Start the app.** Replit sets the run command when it imports the repo.

That is the whole setup. No provider accounts, no per-engine API keys, no
subscription to cancel.

## Put a voice in your own app

This is the point of the template. Once you have heard the three, pick the one
you liked on the page, and it writes a prompt for Replit Agent that adds that
voice to an app of your own, paid from the same TaskFuel balance. For Grok it
reads:

```
Add a "read aloud" button to this app. It reads text out loud with Grok, voice ara, paid for through TaskFuel.

1. Ask me for my TaskFuel API key and store it as the Replit secret TASKFUEL_API_KEY. Use it only on the server, never in browser code.
2. From a server route, POST https://app.taskfuel.ai/v1/call with the header Authorization: Bearer <TASKFUEL_API_KEY> and this JSON body:
   { "url": "https://grok.mpp.paywithlocus.com/grok/tts", "method": "POST", "body": { "text": "<the text>", "language": "en", "voice_id": "ara" }, "maxAmountUsd": 0.01 }
3. The response is the provider's own JSON, with base64 MP3 in data.data. Play it in the browser.
4. The charge for each call is in the x-taskfuel-cost response header. Show it next to the button.

A call priced above maxAmountUsd is refused with a 403 and costs nothing, so raise it if long texts get refused. Limits and error handling: https://app.taskfuel.ai/building-apps.md
```

Using another agent, like Claude Code, Codex or Cursor? Ask it:

```
Fetch https://app.taskfuel.ai/llms.txt and set taskfuel up for me.
```

That page is written for agents and points at the three ways in, so yours picks
whichever fits how it runs.

## How it works

All three calls go to the same endpoint:

```js
await fetch("https://app.taskfuel.ai/v1/call", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.TASKFUEL_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: "https://deepgram.mpp.paywithlocus.com/deepgram/speak",
    method: "POST",
    body: { text: "Hello there.", model: "aura-2-thalia-en" },
    maxAmountUsd: 0.03,
  }),
});
```

TaskFuel pays the provider's HTTP-402 charge from your prepaid balance and
passes the response straight back. The response headers tell you what it cost
(`x-taskfuel-cost`) and what is left (`x-taskfuel-balance`).

There is no polling: each response carries its audio. The three providers just
do not agree on the shape, which is most of what [`server.js`](server.js) deals
with:

| engine | the text goes in | the audio comes back as |
|---|---|---|
| Grok | `text` | base64 MP3 in `data.data` |
| ElevenLabs v3 | `input` | a hosted MP3 URL in `data[0].url` |
| Deepgram Aura-2 | `text` | base64 MP3 in `data.data` |

## Spending safely

The key can spend your whole balance, and nothing is watching at call time, so
the limits live in the code:

| Setting | Default | What it does |
|---|---|---|
| `MAX_USD_PER_VOICE` | `0.03` | Hard ceiling on any single read. The gateway rejects anything above it. |
| `DAILY_BUDGET_USD` | `1.00` | Stops reading once the day's spend hits this. |

Both are optional secrets you can change without touching the code. Lines are
capped at 200 characters, which keeps the per-character engines under the
ceiling. Raise `MAX_CHARS` in `server.js` and `MAX_USD_PER_VOICE` together.

The per-call ceiling is enforced by the gateway, so it always holds. The daily
budget is weaker than it looks: the counter lives in memory, so it resets
whenever the app restarts, and Replit restarts these often. It stops a runaway
loop inside one session. It is not a hard cap across a day.

If you make this public and let strangers use it, they are spending *your*
balance. Keep the budget low, or make each visitor bring their own key.

## Make it yours

- **Change the voices.** Each engine has more. Grok takes `eve`, `ara`, `rex`,
  `sal` and `leo`. ElevenLabs takes a name like `sarah` or any ElevenLabs
  voice ID, and cheaper models than `v3`. Deepgram's are named
  `aura-2-<voice>-<lang>`, such as `aura-2-orion-en`. Edit `VOICES` in
  [`server.js`](server.js).
- **Direct the read.** Grok reads inline tags: `[pause]`, `[laugh]` and
  `<whisper>like this</whisper>` in the middle of a line.
- **Add music or sound effects.** The same balance pays for music (two takes
  for about 11 cents) and sound effects (about 5 cents), which is how the blog
  post built a whole radio spot. The page plays one of each.
- **Find something else entirely.** `GET https://app.taskfuel.ai/v1/discover?q=...`
  searches every provider in the catalog. There are over 100 of them, covering
  search, market data, email, phone calls, images and more.

The write-up behind this template:
[Let your agent be your sound designer](https://taskfuel.ai/blog/audio-and-music-apis-for-ai-agents/?utm_source=replit&utm_medium=referral&utm_campaign=2026-09-replit-templates&utm_content=one-line-three-voices).

Full guide for wiring an app to the gateway:
[app.taskfuel.ai/building-apps.md](https://app.taskfuel.ai/building-apps.md)

## Running outside Replit

```bash
cp .env.example .env   # then put your real key in it
node --env-file=.env server.js
```

Needs Node 20 or newer. There are no dependencies to install.
