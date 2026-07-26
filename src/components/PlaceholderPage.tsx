export function PlaceholderPage({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-500">
      <span className="text-lg font-medium">{label}</span>
      <span className="mt-1 text-sm">Coming soon</span>
    </div>
  );
}
