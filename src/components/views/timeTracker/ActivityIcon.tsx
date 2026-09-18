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
