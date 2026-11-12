// Skill actions of useAppState (skills, practice logs, drills, clear older), moved out of
// store.ts unchanged. useAppState calls this hook once and returns the same members as before.
import { useCallback } from 'react';
import type { AppState, Skill, SkillSessionLog, SkillLevel, SkillDrill, SkillDrillCount } from '@/types';
import { uid, todayKey, weekKey } from './time/dates';
import { addLogDrills, drillNameProblem, foldClearedCounts, isDrillGoal, keepValidDrillCounts, normalizeDrillName, normalizeDrillUnit } from './skillDrills';
import type { NewLogDrill } from './skillDrills';
import { renameSkillIn } from './itemEdits';
import { CLEAR_SKILL_LOGS_MAX } from './clearLimits';
import { removeLinkedWeeklyGoals, reconcileLinkedWeeklyGoals, removeWeeklyGoalsWhere } from './points/weeklyGoalPoints';
import { applySkillAwardsInternal } from './points/stateAwards';
import { trustedNow } from './time/clock';
import type { StoreSetState } from './storeSetState';

export function useSkillActions(setState: StoreSetState, get: () => AppState) {
  // --- MODULE 3: SKILL LEARNING TRACKER ACTIONS ---
  const addSkill = useCallback((name: string, category?: string, manualLevel?: SkillLevel) => {
    const skill: Skill = {
      id: uid(),
      name: name.trim(),
      category: category?.trim(),
      manualLevel,
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      return { ...prev, skills: [...prev.skills, skill] };
    });
    return skill;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Minutes are required and earn the points; drill counts ride along and earn nothing. `newDrills`
   * are drills the Log practice form creates in the same save (name rules as the drill dialog):
   * they join the skill and their counts go on this log. Throws with the form's message when a
   * new name can't be used.
   */
  const logSkillPractice = useCallback((skillId: string, durationMinutes: number, note: string, counts?: SkillDrillCount[], newDrills?: readonly NewLogDrill[]) => {
    const date = todayKey();
    const nowIso = trustedNow().toISOString();
    // Ids made once, so a repeated state update adds the same drills.
    const made = (newDrills || []).map((d) => ({
      drill: { id: uid(), name: normalizeDrillName(d.name), unit: normalizeDrillUnit(d.unit), createdAt: nowIso } as SkillDrill,
      count: d.count,
    }));
    if (made.length > 0) {
      const skill = get().skills.find((s) => s.id === skillId);
      if (!skill) throw new Error('This skill was deleted.');
      const check = addLogDrills(skill, made, nowIso);
      if (check.problem) throw new Error(check.problem);
    }
    setState((prev) => {
      const currentSkill = prev.skills.find((s) => s.id === skillId);
      if (!currentSkill) return prev;
      // Checked just above; a name another write took in between leaves those new drills out.
      const grown = addLogDrills(currentSkill, made, nowIso);
      const targetSkill = grown.skill ?? currentSkill;
      const skills = targetSkill === currentSkill ? prev.skills : prev.skills.map((s) => (s.id === skillId ? targetSkill : s));

      const drillCounts = keepValidDrillCounts([...(counts || []), ...(grown.counts || [])], targetSkill);
      const session: SkillSessionLog = {
        id: uid(),
        skillId,
        date,
        durationMinutes,
        note: note.trim(),
        pointsAwarded: 0,
        ...(drillCounts.length > 0 ? { counts: drillCounts } : {}),
        createdAt: trustedNow().toISOString(),
      };

      // The server writes the day's award (applySkillAwardsInternal shows the same row now).
      const awards = applySkillAwardsInternal(prev, [session, ...prev.skillLogs], skills, date);
      return reconcileLinkedWeeklyGoals({
        ...prev,
        skills,
        skillLogs: awards.skillLogs,
        ...awards.points,
      });
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Renames a skill and sets its category; it keeps its id, so logs, sessions and goals follow. */
  const updateSkill = useCallback((skillId: string, changes: { name: string; category: string }) => {
    // Throws the form's message (empty or taken name, deleted skill).
    renameSkillIn(get().skills, skillId, changes, trustedNow().toISOString());
    return setState(
      (prev) => {
        try {
          const skills = renameSkillIn(prev.skills, skillId, changes, trustedNow().toISOString());
          return skills === prev.skills ? prev : { ...prev, skills };
        } catch {
          return prev;
        }
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSkill = useCallback((skillId: string) => {
    const currentWeekKey = weekKey(trustedNow());
    void (
      setState(
        (prev) => {
          const target = prev.skills.find((s) => s.id === skillId);
          if (!target) return prev;

          const remainingSkills = prev.skills.filter((s) => s.id !== skillId);
          const skillLogsToRemove = prev.skillLogs.filter((l) => l.skillId === skillId);
          const remainingSkillLogs = prev.skillLogs.filter((l) => l.skillId !== skillId);

          const linkedRemoval = removeLinkedWeeklyGoals(prev.weeklyGoals, 'skill', [skillId], currentWeekKey);
          const updatedDeletedEntityIds = [
            ...(prev.deletedEntityIds || []),
            skillId,
            ...skillLogsToRemove.map((l) => l.id),
            ...linkedRemoval.removedGoalIds,
          ].slice(-500);

          // Only today's award follows the sessions; earlier days' points stay (as on the server).
          const awards = applySkillAwardsInternal(prev, remainingSkillLogs, remainingSkills, todayKey());

          return {
            ...prev,
            skills: remainingSkills,
            skillLogs: awards.skillLogs,
            weeklyGoals: linkedRemoval.weeklyGoals,
            deletedEntityIds: updatedDeletedEntityIds,
            ...awards.points,
          };
        },
        { immediate: true, actionLabel: 'Skill deletion', entityId: skillId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSkillLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const target = prev.skillLogs.find((s) => s.id === logId);
        if (!target) return prev;

        const remainingSkillLogs = prev.skillLogs.filter((s) => s.id !== logId);
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);

        // Only today's award follows the sessions; an earlier day's points stay (as on the server),
        // and so do its practice minutes (clearedMinutes), so the skill's hours and level hold.
        // Its drill counts go to each drill's clearedCount the same way, so drill totals hold.
        const today = todayKey();
        if (target.date !== today) {
          const mins = typeof target.durationMinutes === 'number' && Number.isFinite(target.durationMinutes) ? target.durationMinutes : 0;
          const nowIso = trustedNow().toISOString();
          const withMinutes = mins > 0
            ? prev.skills.map((sk) => (sk.id === target.skillId ? { ...sk, clearedMinutes: (sk.clearedMinutes || 0) + mins, updatedAt: nowIso } : sk))
            : prev.skills;
          return reconcileLinkedWeeklyGoals({
            ...prev,
            skills: foldClearedCounts(withMinutes, [target], nowIso),
            skillLogs: remainingSkillLogs,
            deletedEntityIds: updatedDeletedEntityIds,
          });
        }
        const awards = applySkillAwardsInternal(prev, remainingSkillLogs, prev.skills, today);
        return reconcileLinkedWeeklyGoals({
          ...prev,
          skillLogs: awards.skillLogs,
          deletedEntityIds: updatedDeletedEntityIds,
          ...awards.points,
        });
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Edits a practice log (Zakria 2026-11-05): minutes only on the log's own local day (today's award
   * is then recomputed, as the server does); after that day its minutes are locked, so an earlier
   * day's points never change. Note and counts can be edited any day (counts never earn points).
   * The server takes an earlier day's edit only when date, skill, minutes and createdAt are unchanged
   * (skill_logs_guard_today, 20261105180000_skill_log_edit_keeps_minutes.sql).
   */
  const updateSkillLog = useCallback(
    (logId: string, changes: { durationMinutes: number; note: string; counts?: SkillDrillCount[]; newDrills?: readonly NewLogDrill[] }) => {
      const target = get().skillLogs.find((l) => l.id === logId);
      if (!target) throw new Error('This practice log was deleted.');
      const nowIso = trustedNow().toISOString();
      const made = (changes.newDrills || []).map((d) => ({
        drill: { id: uid(), name: normalizeDrillName(d.name), unit: normalizeDrillUnit(d.unit), createdAt: nowIso } as SkillDrill,
        count: d.count,
      }));
      if (made.length > 0) {
        const skill = get().skills.find((s) => s.id === target.skillId);
        if (!skill) throw new Error('This skill was deleted.');
        const check = addLogDrills(skill, made, nowIso);
        if (check.problem) throw new Error(check.problem);
      }
      setState((prev) => {
        const current = prev.skillLogs.find((l) => l.id === logId);
        const currentSkill = current ? prev.skills.find((s) => s.id === current.skillId) : undefined;
        if (!current || !currentSkill) return prev;
        const grown = addLogDrills(currentSkill, made, nowIso);
        const targetSkill = grown.skill ?? currentSkill;
        const skills = targetSkill === currentSkill ? prev.skills : prev.skills.map((s) => (s.id === targetSkill.id ? targetSkill : s));
        const today = todayKey();
        const minutesEditable = current.date === today;
        const drillCounts = keepValidDrillCounts([...(changes.counts || []), ...(grown.counts || [])], targetSkill);
        const { counts: _oldCounts, ...rest } = current;
        const updated: SkillSessionLog = {
          ...rest,
          durationMinutes: minutesEditable && changes.durationMinutes > 0 ? changes.durationMinutes : current.durationMinutes,
          note: changes.note.trim(),
          ...(drillCounts.length > 0 ? { counts: drillCounts } : {}),
        };
        const skillLogs = prev.skillLogs.map((l) => (l.id === logId ? updated : l));
        if (!minutesEditable || updated.durationMinutes === current.durationMinutes) {
          return reconcileLinkedWeeklyGoals({ ...prev, skills, skillLogs });
        }
        const awards = applySkillAwardsInternal(prev, skillLogs, skills, today);
        return reconcileLinkedWeeklyGoals({ ...prev, skills, skillLogs: awards.skillLogs, ...awards.points });
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Removes practice logs dated before `beforeDate` (a local day key). Points already earned stay
   * (no earlier day is recomputed), and each skill keeps the cleared minutes in clearedMinutes so
   * its hours and level do not drop. Capped per call like clearWorkoutsBefore.
   */
  const clearSkillLogsBefore = useCallback((beforeDate: string) => {
    void (
      setState(
        (prev) => {
          const toClear = prev.skillLogs
            .filter((l) => l && l.date < beforeDate && l.date !== todayKey())
            .slice(0, CLEAR_SKILL_LOGS_MAX);
          if (toClear.length === 0) return prev;
          const cleared = new Set(toClear.map((l) => l.id));
          const minutesBySkill = new Map<string, number>();
          for (const l of toClear) {
            const mins = typeof l.durationMinutes === 'number' && Number.isFinite(l.durationMinutes) ? l.durationMinutes : 0;
            minutesBySkill.set(l.skillId, (minutesBySkill.get(l.skillId) || 0) + mins);
          }
          const nowIso = trustedNow().toISOString();
          const withMinutes = prev.skills.map((sk) =>
            minutesBySkill.get(sk.id) ? { ...sk, clearedMinutes: (sk.clearedMinutes || 0) + minutesBySkill.get(sk.id)!, updatedAt: nowIso } : sk
          );
          return {
            ...prev,
            // Drill counts of the cleared logs stay in each drill's clearedCount.
            skills: foldClearedCounts(withMinutes, toClear, nowIso),
            skillLogs: prev.skillLogs.filter((l) => !cleared.has(l.id)),
            deletedEntityIds: [...(prev.deletedEntityIds || []), ...cleared].slice(-500),
          };
        },
        { immediate: true, actionLabel: 'Clearing old practice logs' }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Renames a drill or changes its unit. Logs and goals follow it by id. */
  const updateSkillDrill = useCallback((skillId: string, drillId: string, name: string, unit: string) => {
    const skill = get().skills.find((s) => s.id === skillId);
    if (!skill) throw new Error('This skill was deleted.');
    const problem = drillNameProblem(name, skill, drillId);
    if (problem) throw new Error(problem);
    const nowIso = trustedNow().toISOString();
    setState((prev) => ({
      ...prev,
      skills: prev.skills.map((s) =>
        s.id === skillId
          ? {
              ...s,
              drills: (s.drills || []).map((d) => (d.id === drillId ? { ...d, name: normalizeDrillName(name), unit: normalizeDrillUnit(unit) } : d)),
              updatedAt: nowIso,
            }
          : s
      ),
    }));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Deletes a drill: it stays in the skill doc marked deleted, so old logs keep their counts and
   * name. Weekly goals on it this week and later go (past weeks keep theirs, like a skill delete).
   */
  const deleteSkillDrill = useCallback((skillId: string, drillId: string) => {
    const currentWeekKey = weekKey(trustedNow());
    void (
      setState(
        (prev) => {
          const skill = prev.skills.find((s) => s.id === skillId);
          const drill = skill?.drills?.find((d) => d.id === drillId);
          if (!skill || !drill || drill.deletedAt) return prev;
          const nowIso = trustedNow().toISOString();
          const linkedRemoval = removeWeeklyGoalsWhere(prev.weeklyGoals, (g) => isDrillGoal(g, skillId, drillId), currentWeekKey);
          return {
            ...prev,
            skills: prev.skills.map((s) =>
              s.id === skillId
                ? { ...s, drills: (s.drills || []).map((d) => (d.id === drillId ? { ...d, deletedAt: nowIso } : d)), updatedAt: nowIso }
                : s
            ),
            weeklyGoals: linkedRemoval.weeklyGoals,
            deletedEntityIds: linkedRemoval.removedGoalIds.length > 0
              ? [...(prev.deletedEntityIds || []), ...linkedRemoval.removedGoalIds].slice(-500)
              : prev.deletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Count deletion', entityId: drillId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    addSkill,
    logSkillPractice,
    updateSkill,
    deleteSkill,
    deleteSkillLog,
    updateSkillLog,
    clearSkillLogsBefore,
    updateSkillDrill,
    deleteSkillDrill,
  };
}
