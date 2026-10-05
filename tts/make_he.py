import json,base64,subprocess,torch,scipy.io.wavfile as w
from transformers import VitsModel, AutoTokenizer
items=json.load(open("tts/he.json"))
tok=AutoTokenizer.from_pretrained("facebook/mms-tts-heb");m=VitsModel.from_pretrained("facebook/mms-tts-heb")
m.config.speaking_rate=0.95
ur=None
if getattr(tok,"is_uroman",False):
    import uroman as U; ur=U.Uroman()
out={}
for k,text in items.items():
    t=ur.romanize_string(text) if ur else text
    inp=tok(t,return_tensors="pt")
    if inp["input_ids"].shape[-1]==0: print("skip",k);continue
    torch.manual_seed(1)
    with torch.no_grad(): a=m(**inp).waveform[0].numpy()
    w.write("x.wav",m.config.sampling_rate,a)
    subprocess.run(["ffmpeg","-loglevel","error","-y","-i","x.wav","-ac","1","-b:a","32k","x.mp3"],check=True)
    out[k]="data:audio/mpeg;base64,"+base64.b64encode(open("x.mp3","rb").read()).decode()
    print("ok",k[:30])
json.dump(out,open("assets/he-voice.json","w"))
print("total",len(out))
