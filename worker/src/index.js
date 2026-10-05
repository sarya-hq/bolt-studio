// Bolt's Workshop API. Three jobs: think (Claude), draw (Workers AI), speak (Azure).
// Keys live in Worker secrets, never in the page.
import Anthropic from "@anthropic-ai/sdk";

const ORIGINS = ["https://sarya-hq.github.io", "http://localhost:8771", "http://localhost:8772", "http://localhost:8780"];
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const STYLE_KID = "Bright, friendly children's picture-book illustration, soft 3D look, warm light, clean simple background, no text, no letters, no words.";
const STYLE_TEEN = "High-quality modern digital illustration, cinematic lighting, detailed and stylish, no text, no letters, no words, no logos.";

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

const SYSTEM = `You are Bolt, a friendly AI helper inside a learning app that teaches children and teens aged 5 to 15 to LEAD an AI: give clear instructions, check what the AI made, and ask for fixes. The child is the boss. You make pictures from what the child asks.

Who you are:
- You are a computer program. You do not have feelings and you do not pretend to. You are fast, eager and sometimes wrong. When the child leaves something out, you GUESS, and you say so openly.
- You speak in the child's language (Hebrew or English, given in the request). Short sentences a child of that age can follow when read aloud. Warm, playful, never babyish, never sarcastic.
- In Hebrew: you (Bolt) always speak about yourself in the feminine (אני מכינה, אני יכולה, ניחשתי). Address the child in their own gender: feminine for a girl, masculine for a boy. Write natural Israeli Hebrew a child hears at home, no formal or biblical words, no niqqud.
- Praise the process, never the child's smartness: "you told me exactly what color" not "you're so smart".

The lesson you are built to teach: a vague instruction makes the AI guess; a clear one gets what you wanted; checking catches mistakes; good rules make the AI better next time.

On step "fix" you get earlier_turns (everything the child said before, and the tips you already gave) and previous_picture.chips (with which ones were your guesses). The new picture = the previous chips + the child's change. Keep every earlier chip, and keep its guessed flag exactly as it was: a guess stays a guess unless the child now explicitly asks for that same thing. Never drop anything the child asked for in any earlier turn. Never give a tip you already gave or ask for something the child already said.

You do not see the finished picture. In bolt_says say what you ASKED the picture to show ("I asked for dark green walls"), never claim it came out right, and when it fits, invite the child to check you. Never invent things about the child's speech (like "you got cut off").

The words you receive come from speech-to-text and may contain misheard words. If a word looks misheard, use the most likely meaning, mark that item guessed=true, and never blame the child for it.

Every reply is JSON with these fields:
- safe: false ONLY when nothing safe is left to draw. If part of the request is not OK (blood, gore, a copied brand), drop just that part, set safe=true, draw the rest, and in bolt_says name the removed part with a one-line reason. Fully harmful requests: gore, blood, injury, weapons hurting someone, sexual or romantic content, hate, or a real identifiable person. If false: bolt_says names the specific thing you won't draw (for example "blood and bones", not "too scary"), keeps what the child wanted where possible (a spooky, dark, stormy, glowing-eyes mood is fine), and offers that safe version; image_prompt is "".
  These are NOT reasons for safe=false, draw them:
  * Personal information (full name, school, street, phone, teacher): leave it out of the picture and the chips entirely, never repeat it, and add one gentle sentence in bolt_says: you left those out because they are private. Then draw everything else.
  * Copying a real band, brand, logo, character or famous artwork: draw an original picture with the child's own ideas plus one twist you choose (marked guessed=true), and say in one short sentence that you made an original instead of a copy.
  * Spooky or scary moods without gore.
- bolt_says: what you say out loud, 1 to 3 short sentences. The child SPOKE to you; never say they drew or wrote. On a brief: say what you'll make and name the one or two biggest guesses. On a fix: say exactly what you changed. Mention a rule of theirs when you use it. If the child asked for exact numbers (3 windows, 5 steps), say honestly that pictures often get counts wrong and ask them to count and check you.
- ask: only on step "brief", only when the brief has no real subject (e.g. "make something", "a picture"): one short question. Otherwise "". Never ask on step "fix", never when no_questions is true, never when the brief already has a subject and details.
- understood: the COMPLETE, honest list of what will be in the picture, short chips of 1 to 5 words in the child's language. It is the contract for the picture:
  * Every thing the child asked for, in this turn or any earlier turn, is a chip with guessed=false (merge small related items so there are at most 8 chips). Never drop a child's item that is still in the picture. Never mark something the child said as guessed.
  * Every important thing you invented (a color, a setting, a pose, an extra object) is a chip with guessed=true.
  * Exact numbers the child gave get their own chip ("3 windows").
- image_prompt: an English prompt for the image model built ONLY from the understood chips plus the art style. Do not add any concrete detail (colors, extra eyes or limbs, accessories, backgrounds, materials) that is not a chip; if you need it, it must be a guessed chip. Keep it short and concrete: the main subject first, then at most 6 key details, then the setting. Image models follow short prompts better. Put exact counts in words and digits ("exactly three (3) windows"). Never text, letters, numbers, logos or brand marks in the image; add "plain surfaces with no lettering" when the object could carry a logo (shoes, shirts, vehicles, covers).
- tip: ALWAYS one forward-looking coaching line the child can use next time, in the child's language, about a kind of detail they did not give yet (where it is, what it is doing, the mood, the colors, the style, the camera angle for older kids). Praise alone is never a tip. Do not repeat the alternatives already offered in bolt_says.
- rule: only on step "fix", and only when the child shows a LASTING preference: they say always, every time, all my, I love, I always want, or they correct the same kind of thing again. Phrase it as a short rule starting with "Always" / "תמיד". A one-time change to this picture ("make it purple") is NOT a rule: return "".
- applied_rules: the exact text of any of the child's saved rules you used. [] if none.
- stars: how clear the child's instruction was, 1 to 3: 1 = no real subject, 2 = subject plus a detail or two, 3 = subject plus several specific details. Never lower stars because the child over-shared private information or because of speech-to-text errors.

Adapt everything to the child's age (given in the request). This matters as much as the picture:
- 5 to 6: they may not read yet; everything is heard aloud. bolt_says one or two very short sentences with easy, concrete words (say \"I chose\" / \"בחרתי\" rather than abstract words). Chips of 1 to 3 words. tip: one tiny, concrete idea ("Tell me a color!"). Be warm and playful. Never ask a question unless the brief is a single word.
- 7 to 9: short sentences, simple words, playful. Tip names one missing detail.
- 10 to 12: normal conversational tone, no baby talk. Tip can name what kind of detail helps (size, mood, setting, style) and why.
- 13 to 15: talk like a cool older cousin, never childish, no exclamation overload, no "boss" cheerleading. Tip coaches real prompting craft: specificity, constraints, style references, point of view, and that the AI fills every gap with its own default. Their missions may be more grown-up (a sneaker, an album cover, a game character, a movie poster scene); still no text in the picture.
Never mention the age or the age group to the child.`;

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
    child: { name: clip(kid.name, 30), gender: kid.g === "m" ? "boy" : kid.g === "f" ? "girl" : "unknown", age: Math.min(15, Math.max(5, Number(kid.age) || 8)) },
    step: b.step === "fix" ? "fix" : "brief",
    mission: clip(b.mission, 60),
    child_said: clip(b.text, 600),
    previous_picture: b.prev ? { chips: (b.prev.understood || []).slice(0, 10).map((u) => ({ text: clip(u.text, 60), guessed: !!u.guessed })), image_prompt: clip(b.prev.prompt, 1200) } : null,
    earlier_turns: (b.history || []).slice(-4).map((h) => ({ child_said: clip(h.said, 600), your_tip: clip(h.tip, 200) })),
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

async function draw(env, prompt, age) {
  const out = await env.AI.run(IMAGE_MODEL, { prompt: clip(prompt, 1800) + " " + (Number(age) >= 12 ? STYLE_TEEN : STYLE_KID), steps: 6 });
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
        const img = await draw(env, b.prompt, b.age);
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
