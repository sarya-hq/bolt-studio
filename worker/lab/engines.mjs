// Same hard prompts through each drawing engine, saved side by side for review.
import fs from "node:fs";
const API = JSON.parse(fs.readFileSync(new URL("../../api.json", import.meta.url))).url;
const PROMPTS = {
  room: { age: 9, p: "A kid's bedroom with exactly three (3) windows: two on the left wall and one on the back wall. Two beds with blue blankets. A ball pit with only red and blue balls. Dark forest-green walls. A golden retriever sleeping on a round rug." },
  sneaker: { age: 13, p: "A high-top sneaker, cream off-white upper, thick baby-pink laces, a small silver heart on the side, glitter on the heel, plain smooth midsole with no lettering, soft beige background." },
  creature: { age: 7, p: "A round fluffy pink creature with three eyes, small spikes along its back, a long curly tail, standing in a sunny meadow." },
};
fs.mkdirSync(new URL("../../lab/engines/", import.meta.url), { recursive: true });
let md = "# Engines\n\n";
for (const engine of ["flux-schnell", "flux-2-klein", "flux-2-dev", "lucid-origin", "phoenix"]) {
  for (const [k, v] of Object.entries(PROMPTS)) {
    const t0 = Date.now();
    const r = await fetch(API + "/api/draw", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://sarya-hq.github.io" }, body: JSON.stringify({ prompt: v.p, age: v.age, engine }) });
    const ms = Date.now() - t0;
    if (r.ok && (r.headers.get("content-type") || "").includes("image")) { fs.writeFileSync(new URL(`../../lab/engines/${engine}-${k}.jpg`, import.meta.url), Buffer.from(await r.arrayBuffer())); md += `- ${engine} ${k}: ok ${ms} ms\n`; }
    else md += `- ${engine} ${k}: FAIL ${r.status} ${(await r.text()).slice(0, 200)}\n`;
  }
}
fs.writeFileSync(new URL("../../lab/engines/README.md", import.meta.url), md);
console.log(md);
