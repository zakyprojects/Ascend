import React, { useState } from 'react';
import { TimeTrackerActivity } from '@/types';
import { AppStore } from '@/lib/store';
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
  Sparkles,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

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

  const handleConfirmDeleteActivity = async () => {
    if (!deleteTargetActivity) return;
    try {
      store.deleteTimeTrackerActivity(deleteTargetActivity.id);
      showSuccessToast('Activity category removed');
    } catch (err: any) {
      showErrorToast('Failed to remove activity', err?.message);
    } finally {
      setDeleteTargetActivity(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-md">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Tag className="text-emerald-400" size={18} />
            <span>Master Activity Categories</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure custom activities and map them to Ascend ecosystem modules for automated cross-module handoffs and discipline XP.
          </p>
        </div>

        <button
          onClick={onOpenCreateActivityModal}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-900/30 transition-all shrink-0 cursor-pointer"
        >
          <Plus size={15} />
          <span>New Category</span>
        </button>
      </div>

      {/* 2. Activities Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {activities.map((act) => {
          const color = act.color || '#10b981';
          return (
            <div
              key={act.id}
              className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-white/10 transition-all flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-inner mt-0.5"
                  style={{
                    backgroundColor: `${color}25`,
                    color,
                    border: `1px solid ${color}40`,
                  }}
                >
                  <ActivityIcon iconName={act.icon} size={22} />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-sm font-bold text-slate-100 truncate">{act.name}</h4>
                    {act.isSystemDefault && (
                      <span
                        className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-white/5 text-slate-400 border border-white/10 flex items-center gap-0.5"
                        title="System Default"
                      >
                        <ShieldCheck size={10} />
                        Core
                      </span>
                    )}
                  </div>

                  {act.ascendModule ? (
                    <div className="flex items-center gap-1 mt-1.5 text-emerald-300 text-[11px] font-medium">
                      <LinkIcon size={12} className="text-emerald-400 shrink-0" />
                      <span className="truncate">Linked: {act.ascendModule}</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1">General Activity</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onOpenEditActivityModal(act)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                  title="Edit Category"
                >
                  <Edit2 size={14} />
                </button>

                {!act.isSystemDefault && (
                  <button
                    onClick={() => setDeleteTargetActivity(act)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                    title="Delete Category"
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
          title="Delete Activity Category?"
          description={`Are you sure you want to remove the category "${deleteTargetActivity.name}"? Existing blocks will retain their color and information.`}
        />
      )}
    </div>
  );
}
