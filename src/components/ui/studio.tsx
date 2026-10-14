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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">
            <span className="h-1 w-5 rounded-full bg-accent" />
            {eyebrow}
          </p>
        )}
        <h2 className="text-balance text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <span
      className={
        active
          ? 'studio-pill border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-medium'
          : 'studio-pill border border-borderSoft bg-surface2/60 text-muted'
      }
    >
      <span className={active ? 'h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse' : 'h-1.5 w-1.5 rounded-full bg-faint'} />
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
    <div className="studio-card flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center animate-fade-up">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent shadow-glow">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-bold text-white">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
