export function PropField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      {children}
    </div>
  );
}
