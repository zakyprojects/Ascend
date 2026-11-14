import React from 'react';
import { Card } from '@/components/ui/primitives';
import { SECTION_INFO } from './registry';

// Shared pieces of the dev-only Gallery (src/dev). Nothing here is reachable from app code.

/** One Gallery section. Title and note come from the index (registry.ts), so both always agree. */
export function Section({ id, children }: { id: string; children: React.ReactNode }) {
  const info = SECTION_INFO.get(id);
  if (!info) throw new Error(`Gallery section "${id}" is missing from registry.ts`);
  const headingId = `${id}-title`;
  return (
    <Card as="section" id={id} aria-labelledby={headingId} padding="lg" className="space-y-4" style={{ scrollMarginTop: '7rem' }}>
      <div>
        <h3 id={headingId} className="section-title">
          <a href={`#${id}`} className="hover:underline">
            {info.title}
          </a>
        </h3>
        {info.note && <p className="mt-0.5 text-xs text-content-muted">{info.note}</p>}
      </div>
      {children}
    </Card>
  );
}

/** Small caption over a demo row. */
export function Caption({ children }: { children: React.ReactNode }) {
  return <p className="stat-label">{children}</p>;
}
