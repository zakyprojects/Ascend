import { useEffect, useMemo, useRef, useState } from 'react';
import { AppStore } from '@/lib/store';
import { TimeTrackerActivity, TimeTrackerBlock, TimeTrackerTemplate } from '@/types';
import { ensureDefaultActivities, plannedBlocksForDate } from '@/lib/timeTracker';
import { addDays } from '@/lib/dates';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { DayTab } from './timeTracker/DayTab';
import { TemplatesTab } from './timeTracker/TemplatesTab';
import { ActivitiesTab } from './timeTracker/ActivitiesTab';
import { TimeBlockModal, type BlockDraft } from './timeTracker/TimeBlockModal';
import { TemplateEditorModal } from './timeTracker/TemplateEditorModal';
import { ApplyTemplateModal } from './timeTracker/ApplyTemplateModal';
import { ActivityModal } from './timeTracker/ActivityModal';
import { useToast } from '@/components/ui/Toast';
import { Tabs } from '@/components/ui/primitives';
import { CalendarClock, Layers, Tag } from 'lucide-react';
import { View } from '@/components/AppShell';

interface TimeTrackerViewProps {
  store: AppStore;
  onNavigate?: (view: View) => void;
}

type TabType = 'day' | 'templates' | 'categories';

export function TimeTrackerView({ store, onNavigate }: TimeTrackerViewProps) {
  const { showSuccessToast } = useToast();
  const today = useLocalDayKey();

  const [activeTab, setActiveTab] = useState<TabType>('day');
  const [selectedDateKey, setSelectedDateKey] = useState<string>(today);

  // Midnight with the page open: a page that was on "today" moves to the new today and fills it
  // from its template, instead of staying on yesterday (now read-only).
  const previousTodayRef = useRef(today);
  useEffect(() => {
    const previousToday = previousTodayRef.current;
    if (previousToday === today) return;
    previousTodayRef.current = today;
    setSelectedDateKey((current) => (current === previousToday ? today : current));
  }, [today]);

  useEffect(() => {
    store.hydrateTimeTrackerForDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  // Dialogs
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeTrackerBlock | null>(null);
  const [blockDefaults, setBlockDefaults] = useState<{ start: string; end: string }>({ start: '09:00', end: '10:00' });

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TimeTrackerTemplate | null>(null);

  const [applyTemplateModalOpen, setApplyTemplateModalOpen] = useState(false);
  const [preselectedTemplateId, setPreselectedTemplateId] = useState<string | undefined>(undefined);

  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<TimeTrackerActivity | null>(null);

  const timeTracker = store.state.timeTracker;
  const activities = useMemo(() => ensureDefaultActivities(timeTracker?.activities || []), [timeTracker?.activities]);
  const templates = timeTracker?.templates || [];

  const planned = useMemo(
    () => (timeTracker ? plannedBlocksForDate(timeTracker, selectedDateKey, today) : { blocks: [], source: 'none' as const }),
    [timeTracker, selectedDateKey, today]
  );
  const nextDayBlocks = useMemo(
    () => (timeTracker ? plannedBlocksForDate(timeTracker, addDays(selectedDateKey, 1), today).blocks : []),
    [timeTracker, selectedDateKey, today]
  );
  const openToday = (timeTracker?.dailyLogs?.[today] || []).filter((b) => !b.completed && !b.skipped).length;

  const openAddBlock = (start: string, end: string) => {
    setEditingBlock(null);
    setBlockDefaults({ start, end });
    setBlockModalOpen(true);
  };

  const openEditBlock = (block: TimeTrackerBlock) => {
    setEditingBlock(block);
    setBlockModalOpen(true);
  };

  const saveBlock = (draft: BlockDraft) => {
    // A failure reaches the dialog, which shows it in the form and stays open.
    if (editingBlock) {
      store.updateDailyTimeBlock(selectedDateKey, editingBlock.id, draft);
      showSuccessToast('Block saved');
    } else {
      store.addDailyTimeBlock(selectedDateKey, draft);
      showSuccessToast('Block added');
    }
  };

  const openTemplateEditor = (template: TimeTrackerTemplate | null) => {
    setEditingTemplate(template);
    setTemplateModalOpen(true);
  };

  const saveTemplate = (data: { title: string; activeDays: string[]; blocks: TimeTrackerBlock[] }) => {
    if (editingTemplate) {
      store.updateTimeTrackerTemplate(editingTemplate.id, data);
      showSuccessToast('Template saved');
    } else {
      store.createTimeTrackerTemplate(data);
      showSuccessToast('Template created');
    }
  };

  const openApply = (templateId?: string) => {
    setPreselectedTemplateId(templateId);
    setApplyTemplateModalOpen(true);
  };

  const applyTemplate = (templateId: string, mode: 'merge' | 'replace', dateKey: string) => {
    const result = store.applyTemplateToDate(dateKey, templateId, mode);
    if (!result.applied) {
      // Nothing changed: the dialog stays open and says why.
      if (result.reason === 'past') throw new Error("Past days can't change. Pick today or a later day.");
      if (result.reason === 'overlap') throw new Error(`All ${result.rejected} blocks overlap what's planned. Pick Replace to use this template.`);
      throw new Error('This template is no longer there.');
    }
    if (mode === 'replace') showSuccessToast('Template applied', `${result.added} blocks planned.`);
    else if (result.rejected > 0) showSuccessToast('Template added', `${result.added} added, ${result.rejected} left out (they overlap).`);
    else showSuccessToast('Template added', `${result.added} blocks added.`);
  };

  const openActivity = (activity: TimeTrackerActivity | null) => {
    setEditingActivity(activity);
    setActivityModalOpen(true);
  };

  const saveActivity = (data: { name: string; color: string; icon: string; ascendModule?: string }) => {
    if (editingActivity) {
      store.updateTimeTrackerActivity(editingActivity.id, data);
      showSuccessToast('Category saved');
    } else {
      store.addTimeTrackerActivity({ ...data, isSystemDefault: false });
      showSuccessToast('Category created');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="page-title">Time Tracker</h1>
          <p className="page-subtitle">Plan your day in blocks and tick them off.</p>
        </div>
        <div className="max-w-full shrink-0 self-start md:self-auto">
          <Tabs
            ariaLabel="Time Tracker sections"
            variant="segmented"
            size="sm"
            scrollable
            value={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            items={[
              { id: 'day', label: 'Day', icon: CalendarClock, badge: openToday || undefined },
              { id: 'templates', label: 'Templates', icon: Layers },
              { id: 'categories', label: 'Categories', icon: Tag },
            ]}
          />
        </div>
      </div>

      {activeTab === 'day' && (
        <DayTab
          store={store}
          activities={activities}
          templates={templates}
          today={today}
          selectedDateKey={selectedDateKey}
          planned={planned}
          onSelectDateKey={setSelectedDateKey}
          onAddBlock={openAddBlock}
          onEditBlock={openEditBlock}
          onApplyTemplate={() => openApply()}
          onNavigate={onNavigate}
        />
      )}

      {activeTab === 'templates' && (
        <TemplatesTab
          store={store}
          templates={templates}
          activities={activities}
          onCreateTemplate={() => openTemplateEditor(null)}
          onEditTemplate={openTemplateEditor}
          onApplyTemplate={openApply}
        />
      )}

      {activeTab === 'categories' && (
        <ActivitiesTab
          store={store}
          activities={activities}
          today={today}
          onCreateCategory={() => openActivity(null)}
          onEditCategory={openActivity}
        />
      )}

      <TimeBlockModal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        onSave={saveBlock}
        activities={activities}
        context={{ kind: 'day', dateKey: selectedDateKey, dayBlocks: planned.blocks, nextDayBlocks }}
        editingBlock={editingBlock}
        defaultStartTime={blockDefaults.start}
        defaultEndTime={blockDefaults.end}
      />

      <TemplateEditorModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSave={saveTemplate}
        activities={activities}
        templates={templates}
        editingTemplate={editingTemplate}
      />

      <ApplyTemplateModal
        open={applyTemplateModalOpen}
        onClose={() => {
          setApplyTemplateModalOpen(false);
          setPreselectedTemplateId(undefined);
        }}
        templates={templates}
        today={today}
        initialDate={selectedDateKey < today ? today : selectedDateKey}
        preselectedTemplateId={preselectedTemplateId}
        blocksForDate={(dateKey) => (timeTracker ? plannedBlocksForDate(timeTracker, dateKey, today).blocks : [])}
        onApply={applyTemplate}
      />

      <ActivityModal
        open={activityModalOpen}
        onClose={() => setActivityModalOpen(false)}
        onSave={saveActivity}
        editingActivity={editingActivity}
      />
    </div>
  );
}
