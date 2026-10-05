# Bolt's voice, both languages, from Azure Speech (official Microsoft neural voices).
# Needs repo secrets AZURE_SPEECH_KEY and AZURE_SPEECH_REGION. Bolt is female;
# Hebrew lines use feminine forms.
import json,base64,os,sys,time,urllib.request
from xml.sax.saxutils import escape
KEY=os.environ.get("AZURE_SPEECH_KEY","");REGION=os.environ.get("AZURE_SPEECH_REGION","")
if not KEY or not REGION:
    print("No Azure key yet: add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION as repository secrets.");sys.exit(0)
URL=f"https://{REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
JOBS=[("tts/he.json","he-IL","he-IL-HilaNeural","assets/he-voice.json",None,"+4%","-3%"),
      ("tts/en.json","en-US","en-US-JennyNeural","assets/en-voice.json","friendly","+4%","+0%")]
def synth(text,lang,voice,style,pitch,rate):
    body=escape(text)
    inner=f'<prosody pitch="{pitch}" rate="{rate}">{body}</prosody>'
    if style: inner=f'<mstts:express-as style="{style}">{inner}</mstts:express-as>'
    ssml=f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="{lang}"><voice name="{voice}">{inner}</voice></speak>'
    req=urllib.request.Request(URL,data=ssml.encode("utf-8"),method="POST",headers={
        "Ocp-Apim-Subscription-Key":KEY,"Content-Type":"application/ssml+xml",
        "X-Microsoft-OutputFormat":"audio-24khz-48kbitrate-mono-mp3","User-Agent":"bolt-studio"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req,timeout=30) as r: return r.read()
        except Exception as e:
            print("retry",text[:20],e,flush=True);time.sleep(2*(attempt+1))
    raise SystemExit("Azure Speech failed for: "+text[:40])
for src,lang,voice,dst,style,pitch,rate in JOBS:
    items=json.load(open(src));out={}
    for k,text in items.items():
        out[k]="data:audio/mpeg;base64,"+base64.b64encode(synth(text,lang,voice,style,pitch,rate)).decode()
    json.dump(out,open(dst,"w"));print(dst,len(out),flush=True)
