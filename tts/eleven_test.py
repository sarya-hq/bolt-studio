# ElevenLabs Hebrew listening page: library voices that are native Hebrew female, plus top premade voices.
import json, os, urllib.request, urllib.error, html
K=os.environ["ELEVENLABS_API_KEY"]; H={"xi-api-key":K}
def req(url, body=None, raw=False):
    r=urllib.request.Request("https://api.elevenlabs.io"+url, data=json.dumps(body).encode() if body is not None else None, headers={**H,"Content-Type":"application/json"}, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(r, timeout=90) as f: d=f.read()
    return d if raw else json.loads(d)
LINES=["היי! אני בולט. ספרי לי מה לצייר היום.","אני מכינה דרקון קטן שנושף בועות! לא אמרת איזה צבע, אז בחרתי ירוק.","תבדקי את העבודה שלי. זה מה שרצית?"]
cands=[]
try:
    sv=req("/v1/shared-voices?language=he&gender=female&page_size=40&sort=usage_character_count_1y")
    for v in sv.get("voices",[]):
        cands.append({"id":v["voice_id"],"owner":v.get("public_owner_id"),"name":v.get("name"),"desc":(v.get("description") or "")[:90],"preview":v.get("preview_url"),"accent":v.get("accent"),"age":v.get("age"),"lib":True})
    print("library hebrew female voices:",len(cands))
except urllib.error.HTTPError as e: print("shared voices failed",e.code,e.read()[:200])
try:
    mine=req("/v1/voices")["voices"]
    prem=[v for v in mine if (v.get("labels") or {}).get("gender")=="female"][:3]
    for v in prem: cands.append({"id":v["voice_id"],"name":v["name"],"desc":"premade (multilingual)","lib":False})
except urllib.error.HTTPError as e: print("voices list failed",e.code,e.read()[:200])
os.makedirs("voicetest2",exist_ok=True)
page=['<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>קולות לבולט</title><style>body{font-family:system-ui;background:#0E1426;color:#F5F1EA;margin:0 auto;padding:16px;max-width:560px}.v{background:#1B2442;border-radius:18px;padding:14px;margin:12px 0}.v b{font-size:22px;color:#F4C95D}audio{width:100%;margin-top:6px}p{color:#9AA3BD;font-size:14px;margin:6px 0 0}</style></head><body><h1>איזה קול הכי טבעי?</h1><p>כל קול אומר את אותם 3 משפטים של בולט. תגיד לי את המספר.</p>']
n=0
for c in cands:
    if n>=8: break
    files=[]
    for j,l in enumerate(LINES):
        a=None
        for model in ["eleven_v3","eleven_multilingual_v2"]:
            try:
                a=req(f"/v1/text-to-speech/{c['id']}?output_format=mp3_44100_128",{"text":l,"model_id":model,"language_code":"he"},raw=True); c["model"]=model; break
            except urllib.error.HTTPError as e:
                err=e.read()[:200]; print("tts fail",c["name"],model,e.code,err)
                if b"language" in err.lower():
                    try: a=req(f"/v1/text-to-speech/{c['id']}?output_format=mp3_44100_128",{"text":l,"model_id":model},raw=True); c["model"]=model; break
                    except urllib.error.HTTPError as e2: print("retry fail",e2.code,e2.read()[:150])
        if not a: break
        fn=f"{n+1}-{j}.mp3"; open("voicetest2/"+fn,"wb").write(a); files.append((l,fn))
    if len(files)<len(LINES):
        if c.get("preview"):
            n+=1; page.append(f'<div class="v"><b>{n}</b> · {html.escape(c["name"] or "")} <p>{html.escape(c.get("desc",""))}</p><p>דוגמה מקורית של הקול (לא המשפטים של בולט):</p><audio controls preload="none" src="{c["preview"]}"></audio></div>')
        continue
    n+=1
    page.append(f'<div class="v"><b>{n}</b> · {html.escape(c["name"] or "")} <p>{html.escape(c.get("desc",""))} · {c.get("model","")}</p>')
    for l,fn in files: page.append(f'<p>{html.escape(l)}</p><audio controls preload="none" src="{fn}"></audio>')
    page.append('</div>')
    print("ok",n,c["name"],c["id"],c.get("model"))
page.append('</body></html>')
open("voicetest2/index.html","w").write("\n".join(page))
json.dump([{k:c.get(k) for k in ("id","name","model","lib")} for c in cands],open("voicetest2/voices.json","w"),ensure_ascii=False)
