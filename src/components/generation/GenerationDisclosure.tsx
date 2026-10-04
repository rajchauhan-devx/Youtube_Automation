import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function GenerationDisclosure({ title, hint, children, className = '' }: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group/disclosure rounded-xl border border-border bg-surface ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-sm text-gray-300 transition-colors hover:bg-surface2 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{title}</span>
        {hint && <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{hint}</span>}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform group-open/disclosure:rotate-180" />
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}
