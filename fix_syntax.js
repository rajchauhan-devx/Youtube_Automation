import fs from 'fs';

const filePath = 'c:/Users/zrajc/Youtube_Automation/src/App.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Fix ScriptsTab header
const targetScriptsTab = `<span className="text-lg font-medium">{label}</span>
      <span className="mt-1 text-sm">Coming soon</span>
    </div>
          <h2 className="text-base font-semibold">Scripts</h2>`;

const replacementScriptsTab = `<span className="text-lg font-medium">{label}</span>
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
}: {
  data: typeof channelData[string];
  section: Section;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewScript: () => void;
  onRunScript?: (script: Script) => void;
  selectedScript: Script | null;
  onClosePanel: () => void;
}) {
  const allScripts = data.scripts;

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Scripts</h2>`;

if (content.includes(targetScriptsTab)) {
  content = content.replace(targetScriptsTab, replacementScriptsTab);
  console.log('Fixed ScriptsTab header!');
}

fs.writeFileSync(filePath, content, 'utf-8');
