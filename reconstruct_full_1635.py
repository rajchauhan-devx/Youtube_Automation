import json
import os

transcript_path = r"C:\Users\zrajc\.gemini\antigravity\brain\d295cc8f-3e69-4da3-af52-985f8264c88a\.system_generated\logs\transcript_full.jsonl"

file_chunks = {}

with open(transcript_path, "r", encoding="utf-8") as f:
    for line in f:
        data = json.loads(line)
        if data.get("type") == "VIEW_FILE":
            content = data.get("content", "")
            step = data.get("step_index")
            if step in (31, 34, 37, 40):
                file_chunks[step] = content

print(f"Collected chunks for steps: {list(file_chunks.keys())}")

# Combine lines
combined_lines = {}

for step, text in file_chunks.items():
    for line in text.splitlines():
        if line.startswith("File Path:") or line.startswith("Total Lines:") or line.startswith("Total Bytes:") or line.startswith("Showing lines") or line.startswith("The following code"):
            continue
        # Line format: "123: original text"
        if ":" in line:
            parts = line.split(":", 1)
            try:
                line_num = int(parts[0].strip())
                line_content = parts[1]
                if line_content.startswith(" "):
                    line_content = line_content[1:]
                combined_lines[line_num] = line_content
            except ValueError:
                pass

print(f"Extracted {len(combined_lines)} total unique lines from transcript view_file logs!")

sorted_line_nums = sorted(combined_lines.keys())
full_text = "\n".join([combined_lines[num] for num in sorted_line_nums])

target_app_path = r"c:\Users\zrajc\Youtube_Automation\src\App.tsx"
with open(target_app_path, "w", encoding="utf-8") as f:
    f.write(full_text)

print(f"Successfully wrote {len(sorted_line_nums)} lines to {target_app_path}")
