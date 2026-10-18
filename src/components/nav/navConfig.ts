import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Settings,
  ListChecks,
  CalendarCheck,
  Gamepad2,
  CheckSquare,
  ShieldAlert,
  Activity,
  BookOpen,
  Zap,
  Clock,
  HeartPulse,
  BrainCircuit,
  Brain,
  Target,
  FolderKanban,
  Compass,
  GraduationCap,
  Trophy,
  Award,
  Users,
  Bug,
  Lightbulb,
} from 'lucide-react';
import type { View } from '@/components/AppShell';

export interface NavEntry {
  id: View;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: 'track' | 'mind' | 'plan' | 'play';
  label: string;
  icon: LucideIcon;
  items: NavEntry[];
}

export const NAV_DASHBOARD: NavEntry = {
  id: 'dashboard',
  label: 'Dashboard',
  icon: LayoutDashboard,
};

export const NAV_SETTINGS: NavEntry = {
  id: 'settings',
  label: 'Settings',
  icon: Settings,
};

/** Help: reached from the account menu and the palette, not the page groups. */
export const NAV_HELP: NavEntry[] = [
  { id: 'report-bug', label: 'Report a bug', icon: Bug },
  { id: 'suggest-idea', label: 'Suggest an idea', icon: Lightbulb },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'track',
    label: 'Track',
    icon: ListChecks,
    items: [
      { id: 'habits', label: 'Habits', icon: CheckSquare },
      { id: 'bad-habits', label: 'Bad habits', icon: ShieldAlert },
      { id: 'exercise', label: 'Exercise', icon: Activity },
      { id: 'reading', label: 'Reading Hub', icon: BookOpen },
      { id: 'skills', label: 'Skills', icon: Zap },
      { id: 'time-tracker', label: 'Time Tracker', icon: Clock },
    ],
  },
  {
    id: 'mind',
    label: 'Mind',
    icon: Brain,
    items: [
      { id: 'recovery', label: 'Recovery', icon: HeartPulse },
      { id: 'prefrontal', label: 'PFC / Focus', icon: BrainCircuit },
      { id: 'neuroplasticity', label: 'Neuro', icon: Brain },
      { id: 'journal', label: 'Journal', icon: BookOpen },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    icon: CalendarCheck,
    items: [
      { id: 'weekly-goals', label: 'Weekly Goals', icon: Target },
      { id: 'projects-goals', label: 'Projects & Goals', icon: FolderKanban },
      { id: 'plans', label: 'Plans', icon: Compass },
      { id: 'lessons', label: 'Lessons', icon: GraduationCap },
    ],
  },
  {
    id: 'play',
    label: 'Play',
    icon: Gamepad2,
    items: [
      { id: 'leagues', label: 'Leagues', icon: Trophy },
      { id: 'tiers', label: 'Ranks', icon: Award },
      { id: 'partner', label: 'Partners', icon: Users },
    ],
  },
];

export const DEFAULT_GROUP_VIEWS: Record<NavGroup['id'], View> = NAV_GROUPS.reduce(
  (acc, group) => {
    acc[group.id] = group.items[0].id;
    return acc;
  },
  {} as Record<NavGroup['id'], View>
);

const NAV_LABELS = new Map<View, string>(
  [NAV_DASHBOARD, NAV_SETTINGS, ...NAV_HELP, ...NAV_GROUPS.flatMap((group) => group.items)].map((entry) => [entry.id, entry.label])
);

/** The page's name as the navigation shows it (used for the document title). */
export function getViewLabel(view: View): string {
  return NAV_LABELS.get(view) ?? 'Ascend';
}

export function getGroupForView(view: View): NavGroup['id'] | null {
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => item.id === view)) {
      return group.id;
    }
  }
  return null;
}
