# Bolt's voice in both languages: Microsoft neural voices via edge-tts.
# Hebrew lines are written in the masculine, so both voices are male.
import json,base64,asyncio,edge_tts,sys
JOBS=[("tts/he.json","he-IL-AvriNeural","assets/he-voice.json","-4%"),
      ("tts/en.json","en-US-AndrewNeural","assets/en-voice.json","-2%")]
async def main():
    for src,voice,dst,rate in JOBS:
        items=json.load(open(src));out={}
        for k,text in items.items():
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(text,voice,rate=rate).save("x.mp3");break
                except Exception as e:
                    print("retry",k[:20],e);await asyncio.sleep(3)
            out[k]="data:audio/mpeg;base64,"+base64.b64encode(open("x.mp3","rb").read()).decode()
        json.dump(out,open(dst,"w"));print(dst,len(out))
asyncio.run(main())
