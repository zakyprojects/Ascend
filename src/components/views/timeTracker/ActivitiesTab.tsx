import React, { useState } from 'react';
import { TimeTrackerActivity } from '@/types';
import { AppStore } from '@/lib/store';
import { getActivityDisplayColor } from '@/lib/timeTracker';
import { ActivityIcon } from './ActivityIcon';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  Lock,
  Link as LinkIcon,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { toUserMessage } from '@/lib/userMessage';

interface ActivitiesTabProps {
  store: AppStore;
  activities: TimeTrackerActivity[];
  onOpenCreateActivityModal: () => void;
  onOpenEditActivityModal: (activity: TimeTrackerActivity) => void;
}

export function ActivitiesTab({
  store,
  activities,
  onOpenCreateActivityModal,
  onOpenEditActivityModal,
}: ActivitiesTabProps) {
  const { showSuccessToast, showErrorToast } = useToast();
  const [deleteTargetActivity, setDeleteTargetActivity] = useState<TimeTrackerActivity | null>(null);
  const theme = store.state.themePreference || 'dark';

  const handleConfirmDeleteActivity = async () => {
    if (!deleteTargetActivity) return;
    const activityId = deleteTargetActivity.id;
    try {
      store.deleteTimeTrackerActivity(activityId);
      showSuccessToast('Activity removed', 'Activity category removed.', `activity_${activityId}`);
    } catch (err: any) {
      showErrorToast("Couldn't remove activity", toUserMessage(err, 'Try again.'));
    } finally {
      setDeleteTargetActivity(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="section-title text-xl leading-tight flex items-center gap-2">
            <Tag className="text-success-text" size={18} />
            <span>Activity categories</span>
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            Set up your activities and link them to other Ascend sections to earn discipline XP.
          </p>
        </div>

        <button
          onClick={onOpenCreateActivityModal}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-on-brand bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-all shrink-0 cursor-pointer"
        >
          <Plus size={15} />
          <span>New Category</span>
        </button>
      </div>

      {/* 2. Activities Grid */}
      <div className="grid-cards gap-3.5">
        {activities.map((act) => {
          const color = getActivityDisplayColor(act, theme);
          return (
            <div
              key={act.id}
              className="scroll-rise p-4 rounded-2xl border border-overlay-subtle hover:border-overlay-default transition-colors flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: `${color}25`,
                    color,
                    border: `1px solid ${color}40`,
                  }}
                >
                  <ActivityIcon iconName={act.icon} size={20} />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="item-name text-sm truncate">{act.name}</h4>
                    {act.isSystemDefault && (
                      <span
                        className="px-1.5 py-0.2 rounded text-3xs font-medium bg-overlay-subtle text-content-muted border border-overlay-default flex items-center gap-0.5"
                        title="System default"
                      >
                        <ShieldCheck size={10} />
                        Core
                      </span>
                    )}
                  </div>

                  {act.ascendModule ? (
                    <div className="flex items-center gap-1 mt-1.5 text-success-text text-micro font-medium">
                      <LinkIcon size={12} className="shrink-0" />
                      <span className="truncate">Linked: {act.ascendModule}</span>
                    </div>
                  ) : (
                    <p className="text-micro text-content-disabled mt-1">General Activity</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onOpenEditActivityModal(act)}
                  className={`p-1.5 text-content-muted hover:text-content-secondary hover:bg-overlay-subtle rounded-lg transition-colors cursor-pointer ${TAP_TARGET_Y}`}
                  title="Edit category"
                  aria-label="Edit category"
                >
                  <Edit2 size={14} />
                </button>

                {!act.isSystemDefault && (
                  <button
                    onClick={() => setDeleteTargetActivity(act)}
                    className={`p-1.5 text-content-muted hover:text-rose-theme hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer ${TAP_TARGET_Y}`}
                    title="Delete category"
                    aria-label="Delete category"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Activity Modal */}
      {deleteTargetActivity && (
        <ConfirmDeleteModal
          open={Boolean(deleteTargetActivity)}
          onClose={() => setDeleteTargetActivity(null)}
          onConfirm={handleConfirmDeleteActivity}
          title="Delete activity category?"
          description={`Are you sure you want to remove the category "${deleteTargetActivity.name}"? Existing blocks will retain their color and information.`}
        />
      )}
    </div>
  );
}
