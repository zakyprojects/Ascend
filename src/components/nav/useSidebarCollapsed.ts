import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ascend_sidebar_collapsed';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Desktop sidebar collapsed (icon rail) or expanded. Remembered across visits; Ctrl/Cmd+\ toggles
 * it (VS Code / Linear convention). The shortcut is desktop only and silent while a modal is open.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable: state stays in memory */
    }
  }, [collapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.repeat) return;
      if (event.key !== '\\' && event.code !== 'Backslash') return;
      if (!window.matchMedia('(min-width: 1024px)').matches) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return [collapsed, toggle];
}
