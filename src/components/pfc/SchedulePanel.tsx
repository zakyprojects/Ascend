import type { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import { useFocusSession } from './FocusSessionProvider';
import { RunningTimerStrip } from './FocusTimerCard';
import { FollowSchedule } from './schedule/FollowSchedule';

/**
 * Schedule tab: the timer follows today's Time Tracker blocks. A plain focus session that is
 * running shows as a strip; "Show timer" and Stop go back to the Focus tab.
 */
export function SchedulePanel({
  store,
  onNavigate,
  onShowTimer,
}: {
  store: AppStore;
  onNavigate?: (view: View) => void;
  onShowTimer: () => void;
}) {
  const { session } = useFocusSession();
  return (
    <section className="card p-4 sm:p-6 space-y-5 border border-cyan-500/30" aria-label="Follow schedule">
      <h2 className="sr-only">Follow schedule</h2>
      {session && <RunningTimerStrip session={session} onShow={onShowTimer} />}
      <FollowSchedule store={store} onNavigate={onNavigate} onStopped={onShowTimer} />
    </section>
  );
}
