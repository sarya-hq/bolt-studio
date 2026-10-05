# Builds a listening page: the same Hebrew lines in several voices/settings, so a native ear can pick.
import json, os, urllib.request, html
KEY=os.environ["AZURE_SPEECH_KEY"]; REG=os.environ["AZURE_SPEECH_REGION"]; AK=os.environ.get("ANTHROPIC_API_KEY","")
def get(url, data=None, headers={}):
    r=urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    with urllib.request.urlopen(r, timeout=60) as f: return f.read()
voices=json.loads(get(f"https://{REG}.tts.speech.microsoft.com/cognitiveservices/voices/list",headers={"Ocp-Apim-Subscription-Key":KEY}))
he=[v for v in voices if v["Locale"]=="he-IL" or "he-IL" in (v.get("SecondaryLocaleList") or [])]
print("voices that speak he-IL:")
for v in he: print(" ",v["ShortName"],v["Gender"],v.get("VoiceType"),"secondary" if v["Locale"]!="he-IL" else "native")
LINES=["ספרי לי על היצור שלך. איך הוא נראה? באיזה צבע הוא?","אני מכינה דרקון קטן שנושף בועות! לא אמרת איזה צבע, אז בחרתי ירוק.","תבדקי את העבודה שלי. זה מה שרצית?","בפעם הבאה ספרי לי מה הוא עושה, ואיפה הוא גר!"]
def nikud(t):
    if not AK: return t
    body=json.dumps({"model":"claude-opus-5-5","max_tokens":2000,"output_config":{"effort":"low"},"system":"Add full, correct Hebrew niqqud to the sentence for a text-to-speech engine, as it is pronounced in everyday modern Israeli speech to a girl. Return only the sentence.","messages":[{"role":"user","content":t}]}).encode()
    out=json.loads(get("https://api.anthropic.com/v1/messages",body,{"x-api-key":AK,"anthropic-version":"2023-06-01","content-type":"application/json"}))
    return "".join(c.get("text","") for c in out["content"] if c["type"]=="text").strip()
def tts(text, voice, pitch=None, rate=None, lang="he-IL"):
    t=html.escape(text)
    if pitch or rate: t=f'<prosody pitch="{pitch or "+0%"}" rate="{rate or "+0%"}">{t}</prosody>'
    if voice.split("-")[0:2]!=["he","IL"]: t=f'<lang xml:lang="he-IL">{t}</lang>'
    ssml=f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="{lang}"><voice name="{voice}">{t}</voice></speak>'
    return get(f"https://{REG}.tts.speech.microsoft.com/cognitiveservices/v1",ssml.encode(),{"Ocp-Apim-Subscription-Key":KEY,"Content-Type":"application/ssml+xml","X-Microsoft-OutputFormat":"audio-24khz-96kbitrate-mono-mp3","User-Agent":"bolt"})
variants=[("A","היום באפליקציה (הילה, קול מוגבה)","he-IL-HilaNeural","+4%","-3%",False),
          ("B","הילה, קול טבעי","he-IL-HilaNeural",None,None,False),
          ("C","הילה, קול טבעי + ניקוד","he-IL-HilaNeural",None,None,True)]
fem=[v["ShortName"] for v in he if v["Locale"]!="he-IL" and v["Gender"]=="Female"]
pref=[n for n in fem if "Dragon" in n or "HD" in n]+[n for n in fem if "Multilingual" in n]
for i,n in enumerate(dict.fromkeys(pref).keys()):
    if i>=3: break
    variants.append(("DEF"[i],f"קול רב-לשוני: {n.split('-')[2].split(':')[0]}",n,None,None,False))
os.makedirs("voicetest",exist_ok=True)
nik=[nikud(l) for l in LINES]
page=['<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>בחירת קול לבולט</title><style>body{font-family:system-ui;background:#0E1426;color:#F5F1EA;margin:0;padding:16px;max-width:560px;margin:auto}h1{font-size:24px}.v{background:#1B2442;border-radius:18px;padding:14px;margin:12px 0}.v b{font-size:20px;color:#F4C95D}audio{width:100%;margin-top:6px}p{color:#9AA3BD;font-size:14px;margin:4px 0 0}</style></head><body><h1>איזה קול נשמע הכי טבעי?</h1><p>אותם 4 משפטים בכל גרסה. תגיד לי את האות שנשמעת הכי נכון.</p>']
for code,label,voice,p,r,useN in variants:
    page.append(f'<div class="v"><b>{code}</b> · {html.escape(label)}')
    for j,l in enumerate(LINES):
        try:
            a=tts(nik[j] if useN else l, voice, p, r)
            fn=f"{code}{j}.mp3"; open("voicetest/"+fn,"wb").write(a)
            page.append(f'<p>{html.escape(l)}</p><audio controls preload="none" src="{fn}"></audio>')
        except Exception as e:
            print("fail",code,voice,e); page.append(f'<p>נכשל: {html.escape(str(e))[:80]}</p>')
    page.append('</div>')
page.append('</body></html>')
open("voicetest/index.html","w").write("\n".join(page))
print("niqqud:",nik)
