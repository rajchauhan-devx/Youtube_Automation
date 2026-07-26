import type { LucideIcon } from 'lucide-react';

export function ToolbarBtn({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      title={label}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-300 hover:bg-surface2"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}
