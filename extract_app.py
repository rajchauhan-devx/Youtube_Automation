import json
import os

transcript_path = r"C:\Users\zrajc\.gemini\antigravity\brain\d295cc8f-3e69-4da3-af52-985f8264c88a\.system_generated\logs\transcript_full.jsonl"

all_views = []

with open(transcript_path, "r", encoding="utf-8") as f:
    for line in f:
        data = json.loads(line)
        if data.get("type") == "VIEW_FILE":
            content = data.get("content", "")
            if "File Path: `file:///c:/Users/zrajc/Youtube_Automation/src/App.tsx`" in content:
                all_views.append((data.get("step_index"), content))

print(f"Found {len(all_views)} view_file calls for App.tsx in d295cc8f")

# Let's inspect step indices
for step_idx, content in all_views:
    lines = content.splitlines()
    print(f"Step {step_idx}: {lines[0] if lines else ''} | {lines[3] if len(lines)>3 else ''}")
