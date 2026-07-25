import json
import os

t_path = r"C:\Users\zrajc\.gemini\antigravity\brain\d295cc8f-3e69-4da3-af52-985f8264c88a\.system_generated\logs\transcript_full.jsonl"

with open(t_path, "r", encoding="utf-8") as f:
    for line in f:
        data = json.loads(line)
        step = data.get("step_index")
        if step in (581, 602):
            t_calls = data.get("tool_calls", [])
            print(f"Step {step}: tool_calls = {[c.get('name') for c in t_calls]}")
            for c in t_calls:
                args = c.get("args", {})
                print(f"  TargetFile: {args.get('TargetFile')}")
                if "CodeContent" in args:
                    print(f"  CodeContent length: {len(args['CodeContent'])}")
                    with open(r"c:\Users\zrajc\Youtube_Automation\src\App.tsx", "w", encoding="utf-8") as out:
                        out.write(args['CodeContent'])
                    print("  Wrote CodeContent directly to src/App.tsx!")
