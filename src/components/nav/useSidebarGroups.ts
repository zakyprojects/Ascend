import { useCallback, useEffect, useState } from 'react';
import { NAV_GROUPS, type NavGroup } from './navConfig';

const STORAGE_KEY = 'ascend_sidebar_open_groups';
type GroupId = NavGroup['id'];
const KNOWN: GroupId[] = NAV_GROUPS.map((g) => g.id);

function load(): GroupId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return ['track'];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? KNOWN.filter((id) => parsed.includes(id)) : ['track'];
  } catch {
    return ['track'];
  }
}

export function useSidebarGroups() {
  const [openIds, setOpenIds] = useState<GroupId[]>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openIds));
    } catch {
      /* storage unavailable: state stays in memory */
    }
  }, [openIds]);
  const isOpen = useCallback((id: GroupId) => openIds.includes(id), [openIds]);
  const toggle = useCallback(
    (id: GroupId) =>
      setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    []
  );
  const open = useCallback(
    (id: GroupId) => setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id])),
    []
  );
  return { isOpen, toggle, open };
}
