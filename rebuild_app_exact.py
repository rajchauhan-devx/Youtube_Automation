import json
import os

transcript_path = r"C:\Users\zrajc\.gemini\antigravity\brain\202a8efe-0918-4153-9324-6ce63ba77a43\.system_generated\logs\transcript_full.jsonl"

lines_dict = {}

with open(transcript_path, "r", encoding="utf-8") as f:
    for line in f:
        data = json.loads(line)
        content = data.get("content", "")
        if "File Path: `file:///c:/Users/zrajc/Youtube_Automation/src/App.tsx`" in content:
            for l in content.splitlines():
                if ":" in l and not l.startswith("File Path:") and not l.startswith("Total Lines:") and not l.startswith("Total Bytes:") and not l.startswith("Showing lines") and not l.startswith("The following code"):
                    parts = l.split(":", 1)
                    try:
                        num = int(parts[0].strip())
                        val = parts[1]
                        if val.startswith(" "):
                            val = val[1:]
                        lines_dict[num] = val
                    except ValueError:
                        pass

print(f"Collected {len(lines_dict)} unique line numbers from conversation 202a8efe")

# Also collect from session d295cc8f
t2_path = r"C:\Users\zrajc\.gemini\antigravity\brain\d295cc8f-3e69-4da3-af52-985f8264c88a\.system_generated\logs\transcript_full.jsonl"
if os.path.exists(t2_path):
    with open(t2_path, "r", encoding="utf-8") as f:
        for line in f:
            data = json.loads(line)
            content = data.get("content", "")
            if "File Path: `file:///c:/Users/zrajc/Youtube_Automation/src/App.tsx`" in content:
                for l in content.splitlines():
                    if ":" in l and not l.startswith("File Path:") and not l.startswith("Total Lines:") and not l.startswith("Total Bytes:") and not l.startswith("Showing lines") and not l.startswith("The following code"):
                        parts = l.split(":", 1)
                        try:
                            num = int(parts[0].strip())
                            val = parts[1]
                            if val.startswith(" "):
                                val = val[1:]
                            if num not in lines_dict:
                                lines_dict[num] = val
                        except ValueError:
                            pass

print(f"Total collected lines from both transcripts: {len(lines_dict)}")

sorted_keys = sorted(lines_dict.keys())
print(f"Line range: {sorted_keys[0]} to {sorted_keys[-1]}")

full_content = "\n".join([lines_dict[k] for k in sorted_keys])
target_path = r"c:\Users\zrajc\Youtube_Automation\src\App.tsx"

with open(target_path, "w", encoding="utf-8") as f:
    f.write(full_content)

print(f"Wrote {len(sorted_keys)} lines to {target_path}")
