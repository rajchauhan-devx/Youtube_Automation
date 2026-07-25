import urllib.request
import json
import os

with open("server/workflows/flux_klein_t2i.json", "r") as f:
    wf = json.load(f)

payload = json.dumps({"prompt": wf}).encode("utf-8")
req = urllib.request.Request("http://127.0.0.1:8188/prompt", data=payload, headers={"Content-Type": "application/json"})

try:
    with urllib.request.urlopen(req) as resp:
        print("Success:", resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}:")
    print(e.read().decode("utf-8"))
except Exception as e:
    print("Error:", e)
