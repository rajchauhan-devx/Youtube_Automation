import { Construction } from 'lucide-react';
import { StudioEmpty } from './ui/studio';

export function PlaceholderPage({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <StudioEmpty
        icon={<Construction className="h-6 w-6" />}
        title={`${label} is coming soon`}
        hint="This workspace section is planned for the Studio Pro roadmap. Your scripts and production pipeline are unaffected."
      />
    </div>
  );
}
