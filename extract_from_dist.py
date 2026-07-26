import re

dist_js_path = r"c:\Users\zrajc\Youtube_Automation\dist\assets\index-miTj6M79.js"

with open(dist_js_path, "r", encoding="utf-8") as f:
    bundle = f.read()

print(f"Bundle size: {len(bundle)} bytes")

# Search for component names or tab strings
matches = re.findall(r'function [A-Za-z0-9_]+\s*\([^)]*\)\s*\{', bundle)
print(f"Functions found in bundle: {len(matches)}")

# Search for specific strings
for term in ["ScriptRunModal", "GenerationTab", "AssetsTab", "PreviewTab", "ScriptsTab", "parseAIResponse", "userScripts"]:
    pos = bundle.find(term)
    print(f"Term '{term}': found at pos {pos}")
