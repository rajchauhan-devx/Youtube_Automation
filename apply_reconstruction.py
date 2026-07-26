import json
import os

transcript_path = r"C:\Users\zrajc\.gemini\antigravity\brain\d295cc8f-3e69-4da3-af52-985f8264c88a\.system_generated\logs\transcript_full.jsonl"
app_path = r"c:\Users\zrajc\Youtube_Automation\src\App.tsx"

with open(app_path, "r", encoding="utf-8") as f:
    content = f.read()

edits = []
with open(transcript_path, "r", encoding="utf-8") as f:
    for line in f:
        data = json.loads(line)
        if data.get("type") == "PLANNER_RESPONSE":
            for call in data.get("tool_calls", []):
                name = call.get("name")
                args = call.get("args", {})
                if "App.tsx" in args.get("TargetFile", ""):
                    edits.append((data.get("step_index"), name, args))

print(f"Loaded {len(edits)} edits from session d295cc8f")

def apply_single_replace(text, target, replacement):
    if target in text:
        return text.replace(target, replacement, 1), True
    return text, False

for step_idx, name, args in edits:
    if name == "replace_file_content":
        target = args.get("TargetContent", "")
        replacement = args.get("ReplacementContent", "")
        content, ok = apply_single_replace(content, target, replacement)
        print(f"Applied step {step_idx} ({args.get('Description')}): {ok}")
    elif name == "multi_replace_file_content":
        chunks = args.get("ReplacementChunks", [])
        for chunk in chunks:
            target = chunk.get("TargetContent", "")
            replacement = chunk.get("ReplacementContent", "")
            content, ok = apply_single_replace(content, target, replacement)
            print(f"Applied step {step_idx} chunk ({args.get('Description')}): {ok}")

with open(app_path, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Reconstructed App.tsx line count: {len(content.splitlines())}")
