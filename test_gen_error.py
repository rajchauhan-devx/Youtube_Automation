import urllib.request
import json
import time

# Load workflow
with open("server/workflows/flux_klein_t2i.json", "r") as f:
    wf = json.load(f)

# Put a test prompt in node 6
wf["6"]["inputs"]["text"] = "A cute cinematic golden retriever puppy playing in autumn leaves, photorealistic, 8k"

# Queue prompt
payload = json.dumps({"prompt": wf, "client_id": "test-client"}).encode("utf-8")
req = urllib.request.Request("http://127.0.0.1:8188/prompt", data=payload, headers={"Content-Type": "application/json"})

try:
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        prompt_id = res.get("prompt_id")
        print("Prompt queued successfully. Prompt ID:", prompt_id)
except Exception as e:
    print("Failed to queue prompt:", e)
    exit(1)

# Poll history
print("Polling execution status for prompt_id:", prompt_id)
for i in range(60):
    time.sleep(2)
    try:
        req = urllib.request.Request(f"http://127.0.0.1:8188/history/{prompt_id}")
        with urllib.request.urlopen(req) as resp:
            history = json.loads(resp.read().decode("utf-8"))
            if prompt_id in history:
                entry = history[prompt_id]
                print("\n=== HISTORY ENTRY RECEIVED ===")
                print(json.dumps(entry, indent=2))
                break
    except Exception as e:
        print("Polling error:", e)
