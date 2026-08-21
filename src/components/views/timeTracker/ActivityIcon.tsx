import React from 'react';
import {
  Moon,
  BrainCircuit,
  HeartHandshake,
  Activity,
  BookOpen,
  Coffee,
  Utensils,
  Dumbbell,
  Clock,
  Sun,
  Briefcase,
  Code,
  Sparkles,
  Zap,
  Music,
  Tv,
  Flame,
  Gamepad2,
  Smile,
  Shield,
  Target,
  Compass,
  GraduationCap,
  Calendar,
  Layers,
  Footprints,
} from 'lucide-react';

export const AVAILABLE_ACTIVITY_ICONS = [
  'Moon',
  'BrainCircuit',
  'HeartHandshake',
  'Activity',
  'BookOpen',
  'Coffee',
  'Utensils',
  'Dumbbell',
  'Clock',
  'Sun',
  'Briefcase',
  'Code',
  'Sparkles',
  'Zap',
  'Music',
  'Tv',
  'Flame',
  'Gamepad2',
  'Footprints',
  'Smile',
  'Shield',
  'Target',
  'Compass',
  'GraduationCap',
  'Calendar',
  'Layers',
];

export const AVAILABLE_ACTIVITY_COLORS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Amber', value: '#eab308' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Yellow', value: '#facc15' },
];

interface ActivityIconProps {
  iconName: string;
  size?: number;
  className?: string;
}

export function ActivityIcon({ iconName, size = 18, className = '' }: ActivityIconProps) {
  switch (iconName) {
    case 'Moon':
      return <Moon size={size} className={className} />;
    case 'BrainCircuit':
      return <BrainCircuit size={size} className={className} />;
    case 'HeartHandshake':
      return <HeartHandshake size={size} className={className} />;
    case 'Activity':
      return <Activity size={size} className={className} />;
    case 'BookOpen':
      return <BookOpen size={size} className={className} />;
    case 'Coffee':
      return <Coffee size={size} className={className} />;
    case 'Utensils':
      return <Utensils size={size} className={className} />;
    case 'Dumbbell':
      return <Dumbbell size={size} className={className} />;
    case 'Clock':
      return <Clock size={size} className={className} />;
    case 'Sun':
      return <Sun size={size} className={className} />;
    case 'Briefcase':
      return <Briefcase size={size} className={className} />;
    case 'Code':
      return <Code size={size} className={className} />;
    case 'Sparkles':
      return <Sparkles size={size} className={className} />;
    case 'Zap':
      return <Zap size={size} className={className} />;
    case 'Music':
      return <Music size={size} className={className} />;
    case 'Tv':
      return <Tv size={size} className={className} />;
    case 'Flame':
      return <Flame size={size} className={className} />;
    case 'Gamepad2':
      return <Gamepad2 size={size} className={className} />;
    case 'Footprints':
      return <Footprints size={size} className={className} />;
    case 'Smile':
      return <Smile size={size} className={className} />;
    case 'Shield':
      return <Shield size={size} className={className} />;
    case 'Target':
      return <Target size={size} className={className} />;
    case 'Compass':
      return <Compass size={size} className={className} />;
    case 'GraduationCap':
      return <GraduationCap size={size} className={className} />;
    case 'Calendar':
      return <Calendar size={size} className={className} />;
    case 'Layers':
      return <Layers size={size} className={className} />;
    default:
      return <Clock size={size} className={className} />;
  }
}
