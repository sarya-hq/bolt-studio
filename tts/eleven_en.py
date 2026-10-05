# English voice picker: the same Bolt lines in a few natural ElevenLabs voices.
import json, os, urllib.request
K=os.environ["ELEVENLABS_API_KEY"]
VOICES=[("Alice","Xb7hH8MSUJpSbSDYk0k2"),("Jessica","cgSgspJ2msm6clMCkdW9"),("Laura","FGY2WhTYpPnrIDTdsKH5"),("Lily","pFZP5JQG7iQjIQuC4Bku"),("Sarah","EXAVITQu4vr4xnSDxMaL")]
LINES=["Hi! I'm Bolt. Tell me what we should make today.","I'm making a little dragon that blows bubbles! You didn't say a color, so I picked green.","Check my work. Is this what you wanted?"]
os.makedirs("voicetest3",exist_ok=True); out=[]
for i,(n,v) in enumerate(VOICES,1):
    ok=0
    for j,l in enumerate(LINES):
        r=urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{v}?output_format=mp3_44100_128",data=json.dumps({"text":l,"model_id":"eleven_multilingual_v2"}).encode(),headers={"xi-api-key":K,"Content-Type":"application/json"},method="POST")
        try:
            open(f"voicetest3/{i}-{j}.mp3","wb").write(urllib.request.urlopen(r,timeout=60).read()); ok+=1
        except Exception as e: print("fail",n,e)
    out.append({"n":i,"name":n,"id":v,"ok":ok}); print(n,ok)
json.dump(out,open("voicetest3/voices.json","w"))
