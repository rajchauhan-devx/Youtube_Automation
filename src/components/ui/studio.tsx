import type { ReactNode } from 'react';

export function StudioPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            <span className="h-1 w-6 rounded-full bg-accent" />
            {eyebrow}
          </p>
        )}
        <h2 className="text-balance text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <span
      className={
        active
          ? 'studio-pill bg-success/10 text-emerald-300'
          : 'studio-pill bg-white/5 text-muted'
      }
    >
      <span className={active ? 'h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'h-1.5 w-1.5 rounded-full bg-faint'} />
      <span className="capitalize">{status}</span>
    </span>
  );
}

export function StudioEmpty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="studio-card flex flex-col items-center justify-center px-6 py-16 text-center animate-fade-up">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accentSoft text-accent">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold text-white">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
