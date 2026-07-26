import re

app_path = r"c:\Users\zrajc\Youtube_Automation\src\App.tsx"

with open(app_path, "r", encoding="utf-8") as f:
    text = f.read()

# Normalize CRLF
text = text.replace("\r\n", "\n")

# 1. Remove extra </div> at line 381
text = text.replace(
"""      )}
</div>
  );
}""",
"""      )}
    </div>
  );
}"""
)

# 2. Fix broken middle
broken_pattern = """</header>
  );
}

            <Plus className="h-4 w-4" />
            New Script
          </button>
        </div>"""

fixed_pattern = """</header>
  );
}

function PlaceholderPage({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-500">
      <span className="text-lg font-medium">{label}</span>
      <span className="mt-1 text-sm">Coming soon</span>
    </div>
  );
}

/* ============ SCRIPTS TAB ============ */

function ScriptsTab({
  data,
  section,
  selectedId,
  onSelect,
  onNewScript,
  onRunScript,
  selectedScript,
  onClosePanel,
  userScripts,
}: {
  data: typeof channelData[string];
  section: Section;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewScript: () => void;
  onRunScript?: (script: Script) => void;
  selectedScript: Script | null;
  onClosePanel: () => void;
  userScripts?: Script[];
}) {
  const allScripts = [...(userScripts || []), ...data.scripts];

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Scripts</h2>
          <button
            onClick={onNewScript}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-200 hover:bg-surface2"
          >
            <Plus className="h-4 w-4" />
            New Script
          </button>
        </div>"""

if broken_pattern in text:
    text = text.replace(broken_pattern, fixed_pattern)
    print("Successfully replaced broken pattern in Python!")
else:
    print("broken_pattern not found in text!")

with open(app_path, "w", encoding="utf-8") as f:
    f.write(text)
