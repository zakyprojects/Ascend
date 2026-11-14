import React from 'react';
import { cx } from '@/components/ui/primitives';

interface SettingRowProps {
  title: string;
  description?: React.ReactNode;
  /** The control on the right (a Switch, a button). */
  control?: React.ReactNode;
  className?: string;
}

/** One setting: its name and a plain line about it on the left, its control on the right. */
export function SettingRow({ title, description, control, className }: SettingRowProps) {
  return (
    <div className={cx('flex items-start justify-between gap-4 py-3.5', className)}>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-content-primary">{title}</p>
        {description && <div className="text-xs leading-relaxed text-content-muted">{description}</div>}
      </div>
      {control && <div className="shrink-0 pt-0.5">{control}</div>}
    </div>
  );
}

/** A section's card: the section title, then its content. */
export function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 space-y-4" aria-labelledby={`settings-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <h2 id={`settings-${title.toLowerCase().replace(/\s+/g, '-')}`} className="section-title">
        {title}
      </h2>
      {children}
    </section>
  );
}
