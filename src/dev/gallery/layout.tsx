import { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Card, Disclosure } from '@/components/ui/primitives';
import { Section } from './shared';

function DisclosureDemo() {
  return (
    <div className="space-y-3">
      <Disclosure title="The 8+8+8 guide">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Content guides and background reads, not a page's rules (those are in How it works).</li>
          <li>The summary stays on the page; the detail opens on demand.</li>
        </ul>
      </Disclosure>
      <Disclosure title="Missing a habit costs points" icon={AlertTriangle} tone="warning">
        <p>Each missed day in a row costs more than the last, up to a limit.</p>
      </Disclosure>
      <Disclosure title="Opens by default" icon={Info} defaultOpen>
        <p>defaultOpen shows the detail on first render.</p>
      </Disclosure>
    </div>
  );
}

export function LayoutGroup() {
  const [cardClicks, setCardClicks] = useState<number>(0);
  return (
    <>
      <Section id="cards">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card variant="default">
              <p className="text-sm text-content-primary">Variant: default</p>
            </Card>
            <Card variant="subtle">
              <p className="text-sm text-content-primary">Variant: subtle</p>
            </Card>
            <Card variant="interactive" onClick={() => setCardClicks((c) => c + 1)}>
              <p className="text-sm text-content-primary">Variant: interactive (clicked {cardClicks} times)</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card padding="none" className="border border-dashed border-overlay-default">
              <p className="text-sm text-content-primary">padding="none"</p>
            </Card>
            <Card padding="sm">
              <p className="text-sm text-content-primary">padding="sm"</p>
            </Card>
            <Card padding="md">
              <p className="text-sm text-content-primary">padding="md"</p>
            </Card>
            <Card padding="lg">
              <p className="text-sm text-content-primary">padding="lg"</p>
            </Card>
          </div>

          <Card as="section">
            <p className="text-sm text-content-primary">Card as="section"</p>
            <div className="card mt-3 p-3">
              <p className="text-sm text-content-secondary">A card inside a card flattens (no second border box).</p>
            </div>
          </Card>

          <ul className="space-y-2">
            {[1, 2, 3].map((n) => (
              <Card key={n} as="li">
                <span className="text-sm text-content-primary">Card as="li" (item {n})</span>
              </Card>
            ))}
          </ul>
        </div>
      </Section>

      <Section id="disclosure">
        <DisclosureDemo />
      </Section>
    </>
  );
}
