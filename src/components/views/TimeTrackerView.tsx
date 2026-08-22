import React, { useState, useMemo } from 'react';
import { AppStore } from '@/lib/store';
import {
  TimeTrackerActivity,
  TimeTrackerBlock,
  TimeTrackerTemplate,
} from '@/types';
import { ensureDefaultActivities } from '@/lib/timeTracker';
import { todayKey } from '@/lib/dates';
import { ScheduleTab } from './timeTracker/ScheduleTab';
import { TemplatesTab } from './timeTracker/TemplatesTab';
import { ActivitiesTab } from './timeTracker/ActivitiesTab';
import { TimeBlockModal } from './timeTracker/TimeBlockModal';
import { TemplateEditorModal } from './timeTracker/TemplateEditorModal';
import { ApplyTemplateModal } from './timeTracker/ApplyTemplateModal';
import { ActivityModal } from './timeTracker/ActivityModal';
import { useToast } from '@/components/ui/Toast';
import { Clock, Layers, Tag, Calendar, Sparkles } from 'lucide-react';
import { View } from '@/components/AppShell';

interface TimeTrackerViewProps {
  store: AppStore;
  onNavigate?: (view: View) => void;
}

type TabType = 'schedule' | 'templates' | 'activities';

export function TimeTrackerView({ store, onNavigate }: TimeTrackerViewProps) {
  const { showSuccessToast, showErrorToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey());

  // Modal States
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeTrackerBlock | null>(null);
  const [defaultBlockStartTime, setDefaultBlockStartTime] = useState<string>('09:00');

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TimeTrackerTemplate | null>(null);

  const [applyTemplateModalOpen, setApplyTemplateModalOpen] = useState(false);
  const [preselectedTemplateId, setPreselectedTemplateId] = useState<string | undefined>(undefined);

  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<TimeTrackerActivity | null>(null);

  // Read TimeTracker State
  const timeTrackerState = store.state.timeTracker;
  const rawActivities = timeTrackerState?.activities || [];
  const activities = useMemo(() => ensureDefaultActivities(rawActivities), [rawActivities]);
  const templates = timeTrackerState?.templates || [];

  const currentDailyBlocks = useMemo(() => {
    return timeTrackerState?.dailyLogs?.[selectedDateKey] || [];
  }, [timeTrackerState?.dailyLogs, selectedDateKey]);

  // --- Handlers: Time Blocks ---
  const handleOpenAddBlock = (defaultStart: string = '09:00') => {
    setEditingBlock(null);
    setDefaultBlockStartTime(defaultStart);
    setBlockModalOpen(true);
  };

  const handleOpenEditBlock = (block: TimeTrackerBlock) => {
    setEditingBlock(block);
    setBlockModalOpen(true);
  };

  const handleSaveBlock = async (blockData: {
    activityId: string;
    secondaryActivityIds?: string[];
    startTime: string;
    endTime: string;
    customTitle?: string;
    notes?: string;
  }) => {
    try {
      if (editingBlock) {
        store.updateDailyTimeBlock(selectedDateKey, editingBlock.id, blockData);
        showSuccessToast('Time block updated');
      } else {
        store.addDailyTimeBlock(selectedDateKey, blockData);
        showSuccessToast('Time block scheduled');
      }
    } catch (err: any) {
      showErrorToast('Failed to schedule block', err?.message);
      throw err;
    }
  };

  // --- Handlers: Templates ---
  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateModalOpen(true);
  };

  const handleOpenEditTemplate = (template: TimeTrackerTemplate) => {
    setEditingTemplate(template);
    setTemplateModalOpen(true);
  };

  const handleSaveTemplate = async (templateData: {
    title: string;
    activeDays: string[];
    blocks: TimeTrackerBlock[];
  }) => {
    try {
      if (editingTemplate) {
        store.updateTimeTrackerTemplate(editingTemplate.id, templateData);
        showSuccessToast('Blueprint template updated');
      } else {
        store.createTimeTrackerTemplate(templateData);
        showSuccessToast('Blueprint template created');
      }
    } catch (err: any) {
      showErrorToast('Failed to save blueprint', err?.message);
      throw err;
    }
  };

  // --- Handlers: Apply Template ---
  const handleOpenApplyTemplate = (templateId?: string) => {
    setPreselectedTemplateId(templateId);
    setApplyTemplateModalOpen(true);
  };

  const handleApplyTemplate = async (templateId: string, mode: 'merge' | 'replace', targetDate: string) => {
    try {
      const dateToApply = targetDate || selectedDateKey;
      const result = store.applyTemplateToDate(dateToApply, templateId, mode);

      if (mode === 'replace') {
        showSuccessToast('Blueprint Applied', `Blueprint applied: ${result.added} blocks scheduled.`);
      } else {
        if (result.added > 0 && result.rejected === 0) {
          showSuccessToast('Blueprint Merged', `Blueprint merged: ${result.added} blocks added.`);
        } else if (result.added > 0 && result.rejected > 0) {
          showSuccessToast('Blueprint Merged', `Blueprint merged: ${result.added} added, ${result.rejected} skipped (overlap).`);
        } else if (result.added === 0 && result.rejected > 0) {
          showErrorToast('Merge Skipped', `All ${result.rejected} blocks overlapped with existing schedule.`);
        } else {
          showSuccessToast('Blueprint Applied', 'Blueprint applied.');
        }
      }
    } catch (err: any) {
      showErrorToast('Failed to apply blueprint', err?.message);
      throw err;
    }
  };

  // --- Handlers: Activities ---
  const handleOpenCreateActivity = () => {
    setEditingActivity(null);
    setActivityModalOpen(true);
  };

  const handleOpenEditActivity = (activity: TimeTrackerActivity) => {
    setEditingActivity(activity);
    setActivityModalOpen(true);
  };

  const handleSaveActivity = async (activityData: {
    name: string;
    color: string;
    icon: string;
    ascendModule?: string;
  }) => {
    try {
      if (editingActivity) {
        store.updateTimeTrackerActivity(editingActivity.id, activityData);
        showSuccessToast('Activity category updated');
      } else {
        store.addTimeTrackerActivity({ ...activityData, isSystemDefault: false });
        showSuccessToast('Activity category created');
      }
    } catch (err: any) {
      showErrorToast('Failed to save activity', err?.message);
      throw err;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* 1. Main View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full aspect-square bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 shadow-inner">
              <Clock size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-display font-extrabold text-slate-100 leading-tight">
                Time Tracker
              </h1>
              <p className="text-xs text-slate-400">
                Precision 24-hour time blocking, recurring blueprints, and cross-module execution.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 rounded-2xl bg-slate-900/80 border border-white/10 shrink-0 self-start md:self-auto max-w-full overflow-x-auto">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[10px] sm:text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'schedule'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Clock size={14} className="shrink-0" />
            <span className="whitespace-nowrap">Daily Schedule</span>
            {currentDailyBlocks.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold ${
                  activeTab === 'schedule'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {currentDailyBlocks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[10px] sm:text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'templates'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Layers size={14} className="shrink-0" />
            <span className="whitespace-nowrap">Templates</span>
            {templates.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold ${
                  activeTab === 'templates'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {templates.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('activities')}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[10px] sm:text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'activities'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Tag size={14} className="shrink-0" />
            <span className="whitespace-nowrap">Categories</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold ${
                activeTab === 'activities'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {activities.length}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Active Tab Content */}
      {activeTab === 'schedule' && (
        <ScheduleTab
          store={store}
          activities={activities}
          templates={templates}
          selectedDateKey={selectedDateKey}
          onSelectDateKey={setSelectedDateKey}
          onOpenAddBlockModal={handleOpenAddBlock}
          onOpenEditBlockModal={handleOpenEditBlock}
          onOpenApplyTemplateModal={() => handleOpenApplyTemplate()}
          onNavigate={onNavigate}
        />
      )}

      {activeTab === 'templates' && (
        <TemplatesTab
          store={store}
          templates={templates}
          activities={activities}
          selectedDateKey={selectedDateKey}
          onOpenCreateTemplateModal={handleOpenCreateTemplate}
          onOpenEditTemplateModal={handleOpenEditTemplate}
          onOpenApplyTemplateModal={handleOpenApplyTemplate}
        />
      )}

      {activeTab === 'activities' && (
        <ActivitiesTab
          store={store}
          activities={activities}
          onOpenCreateActivityModal={handleOpenCreateActivity}
          onOpenEditActivityModal={handleOpenEditActivity}
        />
      )}

      {/* 3. Global Modals */}
      {blockModalOpen && (
        <TimeBlockModal
          open={blockModalOpen}
          onClose={() => setBlockModalOpen(false)}
          onSave={handleSaveBlock}
          activities={activities}
          existingBlocks={currentDailyBlocks}
          editingBlock={editingBlock}
          defaultStartTime={defaultBlockStartTime}
        />
      )}

      {templateModalOpen && (
        <TemplateEditorModal
          open={templateModalOpen}
          onClose={() => setTemplateModalOpen(false)}
          onSave={handleSaveTemplate}
          activities={activities}
          templates={templates}
          editingTemplate={editingTemplate}
        />
      )}

      {applyTemplateModalOpen && (
        <ApplyTemplateModal
          open={applyTemplateModalOpen}
          onClose={() => {
            setApplyTemplateModalOpen(false);
            setPreselectedTemplateId(undefined);
          }}
          templates={templates}
          initialDate={selectedDateKey}
          preselectedTemplateId={preselectedTemplateId}
          onApply={handleApplyTemplate}
        />
      )}

      {activityModalOpen && (
        <ActivityModal
          open={activityModalOpen}
          onClose={() => setActivityModalOpen(false)}
          onSave={handleSaveActivity}
          editingActivity={editingActivity}
        />
      )}
    </div>
  );
}
