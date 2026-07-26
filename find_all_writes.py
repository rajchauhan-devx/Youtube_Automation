import json

t_path = r"C:\Users\zrajc\.gemini\antigravity\brain\d295cc8f-3e69-4da3-af52-985f8264c88a\.system_generated\logs\transcript_full.jsonl"

with open(t_path, "r", encoding="utf-8") as f:
    for line in f:
        data = json.loads(line)
        step = data.get("step_index")
        t_calls = data.get("tool_calls", [])
        for c in t_calls:
            if "App.tsx" in str(c.get("args", {})):
                print(f"Step {step}: name={c.get('name')}, desc={c.get('args', {}).get('Description')}")
                if "CodeContent" in c.get("args", {}):
                    print(f"  --> FOUND write_to_file CodeContent len={len(c['args']['CodeContent'])}")
                    with open(r"c:\Users\zrajc\Youtube_Automation\src\App.tsx", "w", encoding="utf-8") as out:
                        out.write(c['args']['CodeContent'])
                    print("  --> WROTE FULL App.tsx successfully!")
