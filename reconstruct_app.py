import json
import os
import re

# Read base file from git 2ca0666 commit
base_app_path = r"c:\Users\zrajc\Youtube_Automation\src\App.tsx"
with open(base_app_path, "r", encoding="utf-8") as f:
    app_lines = f.readlines()

print(f"Base App.tsx line count: {len(app_lines)}")

# Transcripts to check
transcripts = [
    r"C:\Users\zrajc\.gemini\antigravity\brain\d295cc8f-3e69-4da3-af52-985f8264c88a\.system_generated\logs\transcript_full.jsonl",
    r"C:\Users\zrajc\.gemini\antigravity\brain\202a8efe-0918-4153-9324-6ce63ba77a43\.system_generated\logs\transcript_full.jsonl"
]

all_edits = []

for t_path in transcripts:
    if not os.path.exists(t_path):
        continue
    with open(t_path, "r", encoding="utf-8") as f:
        for line in f:
            data = json.loads(line)
            if data.get("type") == "PLANNER_RESPONSE":
                t_calls = data.get("tool_calls", [])
                for call in t_calls:
                    name = call.get("name")
                    args = call.get("args", {})
                    target = args.get("TargetFile", "")
                    if "App.tsx" in target:
                        all_edits.append((data.get("step_index"), name, args))

print(f"Total App.tsx edits found across transcripts: {len(all_edits)}")

# Print out edits summary
for step_idx, name, args in all_edits:
    desc = args.get("Description", "")
    st = args.get("StartLine", "")
    end = args.get("EndLine", "")
    print(f"Step {step_idx}: {name} (lines {st}-{end}) - {desc}")
