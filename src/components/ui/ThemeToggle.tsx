import { Moon, Sun } from 'lucide-react';
import { toggleThemeWithReveal } from '@/lib/themeTransition';
import { Button } from './primitives';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

/** Header theme switch: the icon turns as it swaps, and the new theme grows out of the button. */
export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  const iconBase = 'absolute inset-0 m-auto transition-[opacity,transform] duration-base ease-emphasized';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      onClick={(event) => toggleThemeWithReveal(event.currentTarget, onToggle)}
    >
      <span className="relative block w-[18px] h-[18px]" aria-hidden="true">
        <Sun size={18} className={`${iconBase} ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`} />
        <Moon size={18} className={`${iconBase} ${isDark ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
      </span>
    </Button>
  );
}
