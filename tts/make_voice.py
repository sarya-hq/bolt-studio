# Bolt's voice in both languages: Microsoft neural voices via edge-tts.
# Bolt is female in both languages; Hebrew lines use feminine forms.
import json,base64,asyncio,edge_tts,sys
JOBS=[("tts/he.json","he-IL-HilaNeural","assets/he-voice.json","-3%","+6Hz"),
      ("tts/en.json","en-US-AvaNeural","assets/en-voice.json","+0%","+6Hz")]
async def main():
    for src,voice,dst,rate,pitch in JOBS:
        items=json.load(open(src));out={}
        for k,text in items.items():
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(text,voice,rate=rate,pitch=pitch).save("x.mp3");break
                except Exception as e:
                    print("retry",k[:20],e);await asyncio.sleep(3)
            out[k]="data:audio/mpeg;base64,"+base64.b64encode(open("x.mp3","rb").read()).decode()
        json.dump(out,open(dst,"w"));print(dst,len(out))
asyncio.run(main())
