import { Brain, Repeat, Moon, Lightbulb, Clock, Target, ArrowRight } from 'lucide-react';
import { View } from '@/components/AppShell';
import { PageColumns } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { Reveal } from '@/components/ui/Motion';

interface NeuroplasticityProps {
  onViewChange?: (view: View) => void;
}

export function Neuroplasticity({ onViewChange }: NeuroplasticityProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Neuroplasticity</h1>
        <p className="page-subtitle">How your brain rewires itself, and how to use it.</p>
      </div>

      <PageColumns
        lead={
          <>
            {/* Hero */}
            <Reveal index={0} className="card p-6 relative overflow-hidden">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/15 flex items-center justify-center mb-4">
                  <Brain size={28} className="text-purple-hierarchy" />
                </div>
                <h2 className="section-title mb-2">
                  Your brain is not fixed.
                </h2>
                <p className="text-sm text-content-muted leading-relaxed">
                  Scientists used to think the adult brain stopped changing after childhood. It doesn't. Every habit
                  you repeat and every skill you practice changes its structure.
                </p>
                <p className="text-sm text-content-muted leading-relaxed mt-3">
                  This is called <span className="text-purple-hierarchy font-medium">neuroplasticity</span>. It means you
                  can always change, with the right approach.
                </p>
              </div>
            </Reveal>

            {/* Core principle */}
            <Reveal index={1} className="card p-5 border-l-2 border-l-purple-500">
              <p className="italic text-lg font-medium leading-snug text-content-primary mb-2">
                "Neurons that fire together, wire together."
              </p>
              <p className="text-sm text-content-muted">
                This is Hebb's Law. Each time you repeat a behavior, its neural pathway gets stronger and faster,
                until the behavior is automatic. That is how habits form.
              </p>
            </Reveal>

            {/* Key principles */}
            <Reveal index={2}>
              <h2 className="section-title mb-3">Four principles of brain change</h2>
              <div className="grid-cards-lg gap-3">
                <PillarCard
                  icon={<Repeat size={18} />}
                  color="#34d399"
                  title="Repetition over intensity"
                  description="A 10-minute daily habit beats a 2-hour weekly session. The brain rewires through short, spaced repeats, not marathons."
                />
                <PillarCard
                  icon={<Moon size={18} />}
                  color="#60a5fa"
                  title="Sleep locks in learning"
                  description="Sleep is when the brain strengthens the day's useful connections and prunes the rest. Without it, practice doesn't stick as well."
                />
                <PillarCard
                  icon={<Lightbulb size={18} />}
                  color="#fbbf24"
                  title="New things drive growth"
                  description="Routine builds efficiency; new experiences build capacity. Something new releases dopamine, which tells the brain to pay attention and learn."
                />
                <PillarCard
                  icon={<Clock size={18} />}
                  color="#a855f7"
                  title="The 90-day window"
                  description="Research suggests a new behavior takes roughly 66–90 days of steady repetition to become automatic. That's why the 90-Day League is 90 days long."
                />
              </div>
            </Reveal>
          </>
        }
        aside={
          <>
            {/* Practical tips */}
            <Reveal index={3}>
              <h2 className="section-title mb-3">How to use it</h2>
              <div className="card p-5 space-y-3">
                <Tip num="1" text="Start small and repeat daily. Five steady minutes beat the occasional big effort." />
                <Tip num="2" text="Protect your sleep. 7–8 hours is when the brain locks in what you practiced that day." />
                <Tip num="3" text="Try something new regularly. It keeps your brain adaptable." />
                <Tip num="4" text="Don't miss twice. One missed day is fine; two in a row starts to weaken the pathway." />
                <Tip num="5" text="Be patient. A new pathway takes weeks, not days." />
              </div>
            </Reveal>

            {/* 90-Day League CTA */}
            <Reveal index={3} className="card p-5 border border-purple-500/30 bg-purple-500/5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                  <Target size={20} className="text-purple-hierarchy" />
                </div>
                <div className="flex-1">
                  <h3 className="section-title mb-1">The 90-Day League</h3>
                  <p className="text-sm text-content-muted leading-relaxed mb-3">
                    A 90-day competition, long enough for new habits to become automatic.
                  </p>
                  {onViewChange && (
                    <button
                      onClick={() => onViewChange('leagues')}
                      className="btn-secondary text-sm"
                    >
                      Go to 90-Day League <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </Reveal>

            {/* Deep dive lessons */}
            <Reveal index={3}>
              <h2 className="section-title mb-3">Further reading</h2>
              <p className="text-sm text-content-disabled mb-3">
                These lessons go deeper:
              </p>
              <div className="card divide-y divide-overlay-subtle">
                {[
                  'Neuroplasticity: Your Brain Is Not Fixed',
                  'Why Consistency Beats Intensity',
                  'Sleep: Where Memory Consolidation Happens',
                  "Novelty: The Brain's Growth Trigger",
                ].map((title) => (
                  <div key={title} className="p-3 flex items-center gap-2 text-sm text-content-muted">
                    <Brain size={14} className="text-purple-hierarchy shrink-0" />
                    {title}
                  </div>
                ))}
              </div>
              {onViewChange && (
                <button onClick={() => onViewChange('lessons')} className={`btn-ghost text-xs mt-3 ${TAP_TARGET}`}>
                  Read all lessons <ArrowRight size={14} />
                </button>
              )}
            </Reveal>
          </>
        }
      />
    </div>
  );
}

function PillarCard({ icon, color, title, description }: { icon: React.ReactNode; color: string; title: string; description: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </div>
        <div>
          <h3 className="item-name text-sm mb-1">{title}</h3>
          <p className="text-xs text-content-muted leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

function Tip({ num, text }: { num: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0 mt-0.5">
        <span className="figure text-xs text-purple-hierarchy">{num}</span>
      </div>
      <p className="text-sm text-content-muted leading-relaxed">{text}</p>
    </div>
  );
}
