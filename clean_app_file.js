import fs from 'fs';

const filePath = 'c:/Users/zrajc/Youtube_Automation/src/App.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

const searchFragment = `</header>
  );
}

            <Plus className="h-4 w-4" />
            New Script
          </button>
        </div>`;

const cleanFragment = `</header>
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
        </div>`;

if (content.includes(searchFragment)) {
  content = content.replace(searchFragment, cleanFragment);
  console.log('Cleaned up PlaceholderPage and ScriptsTab!');
}

fs.writeFileSync(filePath, content, 'utf-8');
