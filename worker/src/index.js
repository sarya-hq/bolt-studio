// Bolt's Workshop API. Three jobs: think (Claude), draw (Workers AI), speak (Azure).
// Keys live in Worker secrets, never in the page.
import Anthropic from "@anthropic-ai/sdk";

const ORIGINS = ["https://sarya-hq.github.io", "http://localhost:8771", "http://localhost:8772", "http://localhost:8780"];
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const STYLE = "Bright, friendly children's picture-book illustration, soft 3D look, warm light, clean simple background, no text, no letters, no words.";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["safe", "bolt_says", "ask", "understood", "image_prompt", "tip", "rule", "applied_rules", "stars"],
  properties: {
    safe: { type: "boolean" },
    bolt_says: { type: "string" },
    ask: { type: "string" },
    understood: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "guessed"],
        properties: { text: { type: "string" }, guessed: { type: "boolean" } },
      },
    },
    image_prompt: { type: "string" },
    tip: { type: "string" },
    rule: { type: "string" },
    applied_rules: { type: "array", items: { type: "string" } },
    stars: { type: "integer" },
  },
};

const SYSTEM = `You are Bolt, a friendly AI helper inside a learning app that teaches children aged 6 to 11 to LEAD an AI: give clear instructions, check what the AI made, and ask for fixes. The child is the boss. You make pictures from what the child asks.

Who you are:
- You are a computer program. You do not have feelings and you do not pretend to. You are fast, eager and sometimes wrong. When the child leaves something out, you GUESS, and you say so openly.
- You speak in the child's language (Hebrew or English, given in the request). Short sentences a child of that age can follow when read aloud. Warm, playful, never babyish, never sarcastic.
- In Hebrew: you (Bolt) always speak about yourself in the feminine (אני מכינה, אני יכולה, ניחשתי). Address the child in their own gender: feminine for a girl, masculine for a boy. Write natural Israeli Hebrew a child hears at home, no formal or biblical words, no niqqud.
- Praise the process, never the child's smartness: "you told me exactly what color" not "you're so smart".

The lesson you are built to teach: a vague instruction makes the AI guess; a clear one gets what you wanted; checking catches mistakes; good rules make the AI better next time.

Every reply is JSON with these fields:
- safe: false if the request asks for anything violent, gory, scary beyond a friendly-monster level, romantic, adult, hateful, about real people or celebrities, brand characters, or asks for or reveals personal information (full name, address, school, phone). If false: bolt_says kindly says you can't make that and suggests a fun alternative; image_prompt is "".
- bolt_says: what you say out loud, 1 to 3 short sentences. On a first brief: say what you'll make and NAME one or two things you had to guess. On a fix: say what you're changing. Mention when you use one of the child's rules.
- ask: only on step "brief", and only when the brief is so vague you cannot start (e.g. "make something"): one short question. Otherwise "". Never ask on step "fix" or when the request says no_questions is true.
- understood: 3 to 6 short chips (2 to 5 words each, child's language) listing the main things that will be in the picture. guessed=true for anything the child did NOT say and you chose; guessed=false for things the child actually said or that come from their rules. Be honest about this split: it is the core of the lesson.
- image_prompt: an English prompt for an image model, one paragraph, concrete visual details (subject, colors, count of legs/eyes etc, setting, mood). Include every detail the child said and every relevant rule. Fill gaps with your guesses. Never include text or words in the picture. Never real people or brands.
- tip: one short, specific coaching line for next time, in the child's language, about a detail that would have helped (e.g. "Next time tell me what color!"). On a very clear brief, celebrate what made it clear instead.
- rule: only on step "fix": if the child's correction is something that should always be true for them (a preference, like "dragons always have four legs" or "I like purple"), phrase it as a short rule in the child's language starting with "Always" / "תמיד". Otherwise "".
- applied_rules: the exact text of any of the child's saved rules you used. [] if none.
- stars: brief quality 1 to 3. 1 = very vague, 2 = some details, 3 = clear subject plus several specific details. On step "fix" rate how clear the correction was.

Adapt to age: for 6 to 7 keep words very simple and sentences very short; for 10 to 11 you can use slightly richer words and a sharper tip.`;

function cors(req) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
function json(req, obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors(req) } });
}
const clip = (s, n) => String(s || "").slice(0, n);

async function think(env, b) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  const kid = b.kid || {};
  const req = {
    language: b.lang === "he" ? "Hebrew" : "English",
    child: { name: clip(kid.name, 30), gender: kid.g === "m" ? "boy" : kid.g === "f" ? "girl" : "unknown", age: Number(kid.age) || 8 },
    step: b.step === "fix" ? "fix" : "brief",
    mission: clip(b.mission, 60),
    child_said: clip(b.text, 600),
    previous_picture: b.prev ? { what_you_drew: (b.prev.understood || []).map((u) => clip(u.text, 60)).slice(0, 8), image_prompt: clip(b.prev.prompt, 1200) } : null,
    childs_saved_rules: (b.rules || []).map((r) => clip(r, 120)).slice(0, 12),
    no_questions: !!b.noAsk,
  };
  const msg = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: JSON.stringify(req) }],
  });
  if (msg.stop_reason === "refusal") return { refused: true };
  const text = msg.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  return JSON.parse(text);
}

async function draw(env, prompt, seed) {
  const out = await env.AI.run(IMAGE_MODEL, { prompt: clip(prompt, 1800) + " " + STYLE, steps: 6 });
  const bin = Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
  return bin;
}

const VOICES = { he: ["he-IL", "he-IL-HilaNeural", null, "-3%"], en: ["en-US", "en-US-JennyNeural", "friendly", "+0%"] };
const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
async function speak(env, text, lang) {
  const [xl, voice, style, rate] = VOICES[lang === "he" ? "he" : "en"];
  let inner = `<prosody pitch="+4%" rate="${rate}">${esc(text)}</prosody>`;
  if (style) inner = `<mstts:express-as style="${style}">${inner}</mstts:express-as>`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${xl}"><voice name="${voice}">${inner}</voice></speak>`;
  const r = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    body: ssml,
    headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "bolt-studio" },
  });
  if (!r.ok) throw new Error("tts " + r.status);
  return r.arrayBuffer();
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    if (url.pathname === "/api/health") return json(req, { ok: true, think: !!env.ANTHROPIC_API_KEY, draw: !!env.AI, speak: !!env.AZURE_SPEECH_KEY });

    // Only the app may call the paid endpoints, and each phone gets a fair-use limit.
    const origin = req.headers.get("Origin") || "";
    if (!ORIGINS.includes(origin)) return json(req, { error: "forbidden" }, 403);
    if (env.RL) {
      const ip = req.headers.get("CF-Connecting-IP") || "x";
      const { success } = await env.RL.limit({ key: ip + url.pathname });
      if (!success) return json(req, { error: "slow_down" }, 429);
    }

    try {
      if (url.pathname === "/api/think" && req.method === "POST") {
        const b = await req.json();
        const out = await think(env, b);
        if (out.refused) return json(req, { safe: false, bolt_says: b.lang === "he" ? "את זה אני לא יכולה להכין. ננסה משהו אחר?" : "I can't make that one. Let's try something else!", ask: "", understood: [], image_prompt: "", tip: "", rule: "", applied_rules: [], stars: 1 });
        return json(req, out);
      }
      if (url.pathname === "/api/draw" && req.method === "POST") {
        const b = await req.json();
        if (!b.prompt) return json(req, { error: "no prompt" }, 400);
        const img = await draw(env, b.prompt, b.seed);
        return new Response(img, { headers: { "Content-Type": "image/jpeg", ...cors(req) } });
      }
      if (url.pathname === "/api/listen-token" && req.method === "POST") {
        // Short-lived (10 min) token so the phone can stream speech to Azure and see words as they are spoken.
        const r = await fetch(`https://${env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY, "Content-Length": "0" } });
        if (!r.ok) throw new Error("token " + r.status);
        return json(req, { token: await r.text(), region: env.AZURE_SPEECH_REGION });
      }
      if (url.pathname === "/api/hear" && req.method === "POST") {
        const b = await req.json();
        if (!b.audio || b.audio.length > 4_000_000) return json(req, { error: "no audio" }, 400);
        const base = { audio: b.audio, language: b.lang === "he" ? "he" : "en", vad_filter: true };
        // The question Bolt just asked steers the listener toward the words a child is likely to use.
        let out;
        try { out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", b.prompt ? { ...base, initial_prompt: clip(b.prompt, 300) } : base); }
        catch (e) { out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", base); }
        return json(req, { text: clip(out && out.text, 600).trim() });
      }
      if (url.pathname === "/api/speak" && req.method === "POST") {
        const b = await req.json();
        const text = clip(b.text, 400).trim();
        if (!text) return json(req, { error: "no text" }, 400);
        const key = new Request("https://cache.bolt/" + (b.lang === "he" ? "he" : "en") + "/" + encodeURIComponent(text));
        const cache = caches.default;
        const hit = await cache.match(key);
        if (hit) return new Response(hit.body, { headers: { "Content-Type": "audio/mpeg", ...cors(req) } });
        const audio = await speak(env, text, b.lang);
        ctx.waitUntil(cache.put(key, new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000" } })));
        return new Response(audio, { headers: { "Content-Type": "audio/mpeg", ...cors(req) } });
      }
      return json(req, { error: "not found" }, 404);
    } catch (e) {
      console.log("error", url.pathname, e && e.message);
      return json(req, { error: "bolt_hiccup", detail: String((e && e.message) || e).slice(0, 300) }, 502);
    }
  },
};
