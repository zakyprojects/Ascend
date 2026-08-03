import { Brain, Repeat, Moon, Sparkles, Clock, Target, ArrowRight } from 'lucide-react';
import { View } from '@/components/AppShell';

interface NeuroplasticityProps {
  onViewChange?: (view: View) => void;
}

export function Neuroplasticity({ onViewChange }: NeuroplasticityProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-100">Neuroplasticity</h1>
        <p className="text-sm text-slate-500 mt-1">How your brain rewires itself — and how to use it</p>
      </div>

      {/* Hero */}
      <div className="card p-6 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #a855f7, transparent 70%)' }} />
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/15 flex items-center justify-center mb-4">
            <Brain size={32} className="text-purple-400" />
          </div>
          <h2 className="text-xl font-display font-bold text-slate-100 mb-2">
            Your brain is not fixed.
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            For decades, scientists believed the adult brain stopped changing after childhood. We now know
            this is completely wrong. Your brain is constantly rewiring itself — every habit you repeat,
            every skill you practice, every experience you have physically changes its structure.
          </p>
          <p className="text-sm text-slate-400 leading-relaxed mt-3">
            This is called <span className="text-purple-400 font-medium">neuroplasticity</span>, and it means
            you are never stuck with who you are. Change is always possible — it just requires the right approach.
          </p>
        </div>
      </div>

      {/* Core principle */}
      <div className="card p-5 border-l-2 border-purple-500/50">
        <p className="text-lg font-display font-bold text-slate-100 mb-2">
          "Neurons that fire together, wire together."
        </p>
        <p className="text-sm text-slate-400">
          This is the foundational law of neuroplasticity (Hebb's Law). Every time you repeat a behavior,
          the neural pathway involved gets stronger and faster. Over time, it becomes automatic —
          you don't have to think about it anymore. This is how habits are literally built into your brain.
        </p>
      </div>

      {/* Key principles */}
      <div>
        <h2 className="section-title mb-3">The Four Pillars of Brain Change</h2>
        <div className="space-y-3">
          <PillarCard
            icon={<Repeat size={20} />}
            color="#34d399"
            title="Repetition Over Intensity"
            description="A 10-minute daily habit beats a 2-hour weekly session. Brain rewiring happens through repeated, spaced activation — not marathon sessions. The daily repetition keeps neurons firing together, wiring them into a permanent pathway."
          />
          <PillarCard
            icon={<Moon size={20} />}
            color="#60a5fa"
            title="Sleep Consolidates Learning"
            description="Practice is the input, but sleep is where the brain actually does the rewiring. During sleep, your brain replays the day's experiences, strengthens important connections, and prunes unnecessary ones. Without good sleep, your daily repetitions don't consolidate effectively."
          />
          <PillarCard
            icon={<Sparkles size={20} />}
            color="#fbbf24"
            title="Novelty Triggers Growth"
            description="Routine builds efficiency, but novelty builds capacity. When you encounter something new, your brain releases dopamine and activates neuroplasticity. It's literally telling itself to pay attention and learn. This is why trying new things keeps your brain plastic and adaptable."
          />
          <PillarCard
            icon={<Clock size={20} />}
            color="#a855f7"
            title="The 90-Day Window"
            description="Research suggests it takes roughly 66–90 days of consistent repetition for a new behavior to become automatic — to literally wire itself into your brain's default circuitry. This is why the 90-Day League exists: it's a scientifically grounded window for real neurological change."
          />
        </div>
      </div>

      {/* Practical tips */}
      <div>
        <h2 className="section-title mb-3">How to Leverage Neuroplasticity</h2>
        <div className="card p-5 space-y-3">
          <Tip num="1" text="Start small and repeat daily. Even 5 minutes of consistent practice rewires your brain more than sporadic intense effort." />
          <Tip num="2" text="Protect your sleep. 7-8 hours isn't just rest — it's when your brain consolidates everything you practiced that day." />
          <Tip num="3" text="Try something new regularly. Novel experiences keep your brain plastic and prevent it from getting stuck in rigid patterns." />
          <Tip num="4" text="Don't miss twice. One missed day is fine, but two in a row starts to weaken the pathway you've been building." />
          <Tip num="5" text="Be patient. You're not building a habit — you're building a neural pathway. That takes weeks, not days." />
        </div>
      </div>

      {/* 90-Day League CTA */}
      <div className="card p-5 border-2 border-purple-500/30 bg-purple-500/5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
            <Target size={20} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-display font-bold text-slate-100 mb-1">The 90-Day League</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-3">
              This league is designed around the neuroscience of habit formation. 90 days of sustained
              effort is enough time for new behaviors to physically rewire your brain. It's not just a
              competition — it's a window for real, measurable change.
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
      </div>

      {/* Deep dive lessons */}
      <div>
        <h2 className="section-title mb-3">Deep Dive</h2>
        <p className="text-sm text-slate-500 mb-3">
          Read these lessons in the Lessons section for a deeper understanding of neuroplasticity:
        </p>
        <div className="space-y-2">
          {[
            'Neuroplasticity: Your Brain Is Not Fixed',
            'Why Consistency Beats Intensity',
            'Sleep: Where Memory Consolidation Happens',
            "Novelty: The Brain's Growth Trigger",
          ].map((title) => (
            <div key={title} className="card p-3 flex items-center gap-2 text-sm text-slate-400">
              <Brain size={14} className="text-purple-400 shrink-0" />
              {title}
            </div>
          ))}
        </div>
        {onViewChange && (
          <button onClick={() => onViewChange('lessons')} className="btn-ghost text-xs mt-3">
            Read all lessons <ArrowRight size={14} />
          </button>
        )}
      </div>
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
          <h3 className="font-display font-bold text-slate-100 text-sm mb-1">{title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

function Tip({ num, text }: { num: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-purple-400">{num}</span>
      </div>
      <p className="text-sm text-slate-400 leading-relaxed">{text}</p>
    </div>
  );
}
