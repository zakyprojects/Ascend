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
import { Clock, Layers, Tag, Calendar } from 'lucide-react';
import { View } from '@/components/AppShell';

interface TimeTrackerViewProps {
  store: AppStore;
  onNavigate?: (view: View) => void;
}

type TabType = 'schedule' | 'templates' | 'activities';

export function TimeTrackerView({ store, onNavigate }: TimeTrackerViewProps) {
  const { showSuccessToast } = useToast();

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
    // A failure reaches the dialog, which shows it in the form and stays open.
    if (editingBlock) {
      store.updateDailyTimeBlock(selectedDateKey, editingBlock.id, blockData);
      showSuccessToast('Time block updated');
    } else {
      store.addDailyTimeBlock(selectedDateKey, blockData);
      showSuccessToast('Time block scheduled');
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
    // A failure reaches the dialog, which shows it in the form and stays open.
    if (editingTemplate) {
      store.updateTimeTrackerTemplate(editingTemplate.id, templateData);
      showSuccessToast('Template updated');
    } else {
      store.createTimeTrackerTemplate(templateData);
      showSuccessToast('Template created');
    }
  };

  // --- Handlers: Apply Template ---
  const handleOpenApplyTemplate = (templateId?: string) => {
    setPreselectedTemplateId(templateId);
    setApplyTemplateModalOpen(true);
  };

  const handleApplyTemplate = async (templateId: string, mode: 'merge' | 'replace', targetDate: string) => {
    // A failure reaches the dialog, which shows it in the form and stays open.
    const dateToApply = targetDate || selectedDateKey;
    const result = store.applyTemplateToDate(dateToApply, templateId, mode);

    if (mode === 'replace') {
      showSuccessToast('Template applied', `${result.added} blocks scheduled.`);
    } else if (result.added > 0 && result.rejected === 0) {
      showSuccessToast('Template merged', `${result.added} blocks added.`);
    } else if (result.added > 0 && result.rejected > 0) {
      showSuccessToast('Template merged', `${result.added} added, ${result.rejected} skipped (overlap).`);
    } else if (result.added === 0 && result.rejected > 0) {
      // Nothing changed: the dialog stays open and says why.
      throw new Error(`All ${result.rejected} blocks overlap what's already scheduled. Pick Replace to use this template.`);
    } else {
      showSuccessToast('Template applied');
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
    // A failure reaches the dialog, which shows it in the form and stays open.
    if (editingActivity) {
      store.updateTimeTrackerActivity(editingActivity.id, activityData);
      showSuccessToast('Activity updated');
    } else {
      store.addTimeTrackerActivity({ ...activityData, isSystemDefault: false });
      showSuccessToast('Activity created');
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
