import { Copy } from 'lucide-react';
import type { HowItWorksGuide } from '@/components/ui/HowItWorks';
import { PLAN_TYPES, PLAN_TYPE_META } from '@/components/plans/planMeta';

/**
 * Plans. Types and their one-line descriptions from components/plans/planMeta.ts PLAN_TYPE_META,
 * PlanFields ("Who can see it": Only me / Everyone, in Discover; vision Check in every week or month),
 * DiscoverPanel ("Copy to my plans"). Plans earn no points (no award in lib/ or SQL; marketing plans.tsx).
 */
export const plansGuide: HowItWorksGuide = {
  title: 'How plans work',
  intro: 'Pick the kind of plan that fits what you want to change.',
  steps: [
    ...PLAN_TYPES.map((type) => {
      const meta = PLAN_TYPE_META[type];
      return { title: meta.label, text: meta.description, icon: meta.icon, iconClass: `badge-${meta.badge}` };
    }),
    {
      icon: Copy,
      iconClass: 'border-overlay-default bg-overlay-subtle text-content-tertiary',
      title: 'Discover',
      text: 'Plans other members share. Copy one and it becomes your own copy to edit and track; the original never changes.',
    },
  ],
  notes: [
    'A vision checks in every week or every month. Plans with a check-in due are counted at the top of the page.',
    'A new plan is only yours. Set it to Everyone, in Discover to let others copy it, and back to Only me any time.',
    'Tap Reorder to put your plans in your own order. A plan’s steps move with the arrows when you edit it.',
  ],
  points: ['Plans earn no points and can’t cost any. The work they point to, like habits or reading, earns on its own page.'],
};
