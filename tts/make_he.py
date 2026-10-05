# Hebrew voice: Microsoft neural voice (he-IL-HilaNeural) via edge-tts.
import json,base64,asyncio,edge_tts
items=json.load(open("tts/he.json"))
VOICE="he-IL-HilaNeural"
async def one(text,path):
    await edge_tts.Communicate(text,VOICE,rate="-6%").save(path)
async def main():
    out={}
    for k,text in items.items():
        for attempt in range(3):
            try:
                await one(text,"x.mp3");break
            except Exception as e:
                print("retry",k[:20],e);await asyncio.sleep(2)
        out[k]="data:audio/mpeg;base64,"+base64.b64encode(open("x.mp3","rb").read()).decode()
        print("ok",k[:30])
    json.dump(out,open("assets/he-voice.json","w"))
    print("total",len(out))
asyncio.run(main())
