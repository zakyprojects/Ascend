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
import { Tabs } from '@/components/ui/primitives';
import { Clock, Layers, Tag, Calendar, Sparkles } from 'lucide-react';
import { View } from '@/components/AppShell';
import { toUserMessage } from '@/lib/userMessage';

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
  const activities = useMemo(
    () => ensureDefaultActivities(timeTrackerState?.activities || []),
    [timeTrackerState?.activities]
  );
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
      showErrorToast("Couldn't schedule block", toUserMessage(err, 'Try again.'));
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
      showErrorToast("Couldn't save blueprint", toUserMessage(err, 'Try again.'));
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
        showSuccessToast('Blueprint applied', `Blueprint applied: ${result.added} blocks scheduled.`);
      } else {
        if (result.added > 0 && result.rejected === 0) {
          showSuccessToast('Blueprint merged', `Blueprint merged: ${result.added} blocks added.`);
        } else if (result.added > 0 && result.rejected > 0) {
          showSuccessToast('Blueprint merged', `Blueprint merged: ${result.added} added, ${result.rejected} skipped (overlap).`);
        } else if (result.added === 0 && result.rejected > 0) {
          showErrorToast('Nothing merged', `All ${result.rejected} blocks overlapped with existing schedule.`);
        } else {
          showSuccessToast('Blueprint applied', 'Blueprint applied.');
        }
      }
    } catch (err: any) {
      showErrorToast("Couldn't apply blueprint", toUserMessage(err, 'Try again.'));
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
      showErrorToast("Couldn't save activity", toUserMessage(err, 'Try again.'));
      throw err;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* 1. Main View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div>
            <div>
              <h1 className="page-title">Time Tracker</h1>
              <p className="page-subtitle">
                Plan the day in blocks and see where the hours go.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="shrink-0 self-start md:self-auto max-w-full">
          <Tabs
            ariaLabel="Time Tracker sections"
            variant="segmented"
            size="sm"
            scrollable
            value={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            items={[
              { id: 'schedule', label: 'Daily Schedule', icon: Clock, badge: currentDailyBlocks.length },
              { id: 'templates', label: 'Templates', icon: Layers, badge: templates.length },
              { id: 'activities', label: 'Categories', icon: Tag, badge: activities.length },
            ]}
          />
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
