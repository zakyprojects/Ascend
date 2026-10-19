-- Security B1: size limits on what members write (knowledge/mode-a-security-ratelimit-hygiene-2026-10-19.md H1)
--
-- No member-written jsonb/text column had a size limit (only formats were checked), so one
-- scripted account could fill the free 500 MB database with a few huge rows. Each limit is far
-- above the largest live value and above every input limit in the app (checked read-only
-- 2026-10-19; largest live values in brackets):
-- - JSON documents (user_data.state [55,898 B], every sync table's data [max 8,696 B,
--   time_tracker_days]): 1 MiB. Habits keep their completions inside the row (~80 B per day),
--   so this leaves decades of daily history.
-- - JSON lists (plan steps [1,458 B], task subtasks, pact done dates, profiles.active_habits):
--   256 KiB.
-- - profiles.stats [343 B]: 16 KiB. profiles.avatar [1 emoji]: 16 characters (the longest app
--   avatar is a 5-code-point emoji). profiles.uid: exactly 6 digits, as the app generates it.
-- - Free text: 10,000 characters (app inputs allow at most 2,000); journal content 100,000
--   (the journal has no input limit; live max 152).
-- Sizes are octet_length of the JSON text (bytes) and length of text (characters).
-- Every constraint is added NOT VALID and then validated (every live row passed the same
-- checks read-only before this file was written). A write over a limit fails with 23514; the
-- app's sync queue treats 23xxx as permanent and drops that change.

BEGIN;

ALTER TABLE public.user_data
  ADD CONSTRAINT user_data_state_size CHECK (octet_length(state::text) <= 1048576) NOT VALID;

ALTER TABLE public.addiction_trackers
  ADD CONSTRAINT addiction_trackers_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.bad_habit_logs
  ADD CONSTRAINT bad_habit_logs_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.bad_habits
  ADD CONSTRAINT bad_habits_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.habits
  ADD CONSTRAINT habits_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.reading_books
  ADD CONSTRAINT reading_books_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.reading_logs
  ADD CONSTRAINT reading_logs_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.skill_logs
  ADD CONSTRAINT skill_logs_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.skills
  ADD CONSTRAINT skills_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.time_tracker_activities
  ADD CONSTRAINT time_tracker_activities_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.time_tracker_days
  ADD CONSTRAINT time_tracker_days_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.time_tracker_templates
  ADD CONSTRAINT time_tracker_templates_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.weekly_goals
  ADD CONSTRAINT weekly_goals_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_data_size CHECK (octet_length(data::text) <= 1048576) NOT VALID;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_content_size CHECK (length(content) <= 100000) NOT VALID,
  ADD CONSTRAINT journal_entries_mood_size CHECK (length(mood) <= 10000) NOT VALID;

ALTER TABLE public.craving_logs
  ADD CONSTRAINT craving_logs_coping_strategy_size CHECK (length(coping_strategy) <= 10000) NOT VALID,
  ADD CONSTRAINT craving_logs_trigger_text_size CHECK (length(trigger_text) <= 10000) NOT VALID;

ALTER TABLE public.decision_logs
  ADD CONSTRAINT decision_logs_title_size CHECK (length(title) <= 10000) NOT VALID,
  ADD CONSTRAINT decision_logs_rationale_size CHECK (length(rationale) <= 10000) NOT VALID,
  ADD CONSTRAINT decision_logs_expected_outcome_size CHECK (length(expected_outcome) <= 10000) NOT VALID,
  ADD CONSTRAINT decision_logs_reflection_size CHECK (length(reflection) <= 10000) NOT VALID;

ALTER TABLE public.emotion_logs
  ADD CONSTRAINT emotion_logs_emotion_size CHECK (length(emotion) <= 10000) NOT VALID,
  ADD CONSTRAINT emotion_logs_context_size CHECK (length(context) <= 10000) NOT VALID;

ALTER TABLE public.focus_logs
  ADD CONSTRAINT focus_logs_task_name_size CHECK (length(task_name) <= 10000) NOT VALID,
  ADD CONSTRAINT focus_logs_reflection_size CHECK (length(reflection) <= 10000) NOT VALID;

ALTER TABLE public.goals
  ADD CONSTRAINT goals_title_size CHECK (length(title) <= 10000) NOT VALID,
  ADD CONSTRAINT goals_description_size CHECK (length(description) <= 10000) NOT VALID,
  ADD CONSTRAINT goals_category_size CHECK (length(category) <= 10000) NOT VALID;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_title_size CHECK (length(title) <= 10000) NOT VALID,
  ADD CONSTRAINT projects_description_size CHECK (length(description) <= 10000) NOT VALID;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_title_size CHECK (length(title) <= 10000) NOT VALID,
  ADD CONSTRAINT tasks_description_size CHECK (length(description) <= 10000) NOT VALID,
  ADD CONSTRAINT tasks_subtasks_size CHECK (octet_length(subtasks::text) <= 262144) NOT VALID;

ALTER TABLE public.improvement_plans
  ADD CONSTRAINT improvement_plans_title_size CHECK (length(title) <= 10000) NOT VALID,
  ADD CONSTRAINT improvement_plans_description_size CHECK (length(description) <= 10000) NOT VALID,
  ADD CONSTRAINT improvement_plans_category_size CHECK (length(category) <= 10000) NOT VALID,
  ADD CONSTRAINT improvement_plans_review_cadence_size CHECK (length(review_cadence) <= 10000) NOT VALID,
  ADD CONSTRAINT improvement_plans_steps_size CHECK (octet_length(steps::text) <= 262144) NOT VALID;

ALTER TABLE public.user_plan_follows
  ADD CONSTRAINT user_plan_follows_title_size CHECK (length(title) <= 10000) NOT VALID,
  ADD CONSTRAINT user_plan_follows_description_size CHECK (length(description) <= 10000) NOT VALID,
  ADD CONSTRAINT user_plan_follows_review_cadence_size CHECK (length(review_cadence) <= 10000) NOT VALID,
  ADD CONSTRAINT user_plan_follows_steps_size CHECK (octet_length(steps::text) <= 262144) NOT VALID;

ALTER TABLE public.shared_challenges
  ADD CONSTRAINT shared_challenges_title_size CHECK (length(title) <= 10000) NOT VALID,
  ADD CONSTRAINT shared_challenges_target_habit_name_size CHECK (length(target_habit_name) <= 10000) NOT VALID,
  ADD CONSTRAINT shared_challenges_user1_target_size CHECK (length(user1_target) <= 10000) NOT VALID,
  ADD CONSTRAINT shared_challenges_user2_target_size CHECK (length(user2_target) <= 10000) NOT VALID,
  ADD CONSTRAINT shared_challenges_user1_done_dates_size CHECK (octet_length(user1_done_dates::text) <= 262144) NOT VALID,
  ADD CONSTRAINT shared_challenges_user2_done_dates_size CHECK (octet_length(user2_done_dates::text) <= 262144) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_active_habits_size CHECK (octet_length(active_habits::text) <= 262144) NOT VALID,
  ADD CONSTRAINT profiles_stats_size CHECK (octet_length(stats::text) <= 16384) NOT VALID,
  ADD CONSTRAINT profiles_avatar_size CHECK (length(avatar) <= 16) NOT VALID,
  ADD CONSTRAINT profiles_uid_format CHECK (uid ~ '^[0-9]{6}$') NOT VALID;

ALTER TABLE public.user_data VALIDATE CONSTRAINT user_data_state_size;
ALTER TABLE public.addiction_trackers VALIDATE CONSTRAINT addiction_trackers_data_size;
ALTER TABLE public.bad_habit_logs VALIDATE CONSTRAINT bad_habit_logs_data_size;
ALTER TABLE public.bad_habits VALIDATE CONSTRAINT bad_habits_data_size;
ALTER TABLE public.habits VALIDATE CONSTRAINT habits_data_size;
ALTER TABLE public.reading_books VALIDATE CONSTRAINT reading_books_data_size;
ALTER TABLE public.reading_logs VALIDATE CONSTRAINT reading_logs_data_size;
ALTER TABLE public.skill_logs VALIDATE CONSTRAINT skill_logs_data_size;
ALTER TABLE public.skills VALIDATE CONSTRAINT skills_data_size;
ALTER TABLE public.time_tracker_activities VALIDATE CONSTRAINT time_tracker_activities_data_size;
ALTER TABLE public.time_tracker_days VALIDATE CONSTRAINT time_tracker_days_data_size;
ALTER TABLE public.time_tracker_templates VALIDATE CONSTRAINT time_tracker_templates_data_size;
ALTER TABLE public.weekly_goals VALIDATE CONSTRAINT weekly_goals_data_size;
ALTER TABLE public.workouts VALIDATE CONSTRAINT workouts_data_size;
ALTER TABLE public.journal_entries VALIDATE CONSTRAINT journal_entries_content_size;
ALTER TABLE public.journal_entries VALIDATE CONSTRAINT journal_entries_mood_size;
ALTER TABLE public.craving_logs VALIDATE CONSTRAINT craving_logs_coping_strategy_size;
ALTER TABLE public.craving_logs VALIDATE CONSTRAINT craving_logs_trigger_text_size;
ALTER TABLE public.decision_logs VALIDATE CONSTRAINT decision_logs_title_size;
ALTER TABLE public.decision_logs VALIDATE CONSTRAINT decision_logs_rationale_size;
ALTER TABLE public.decision_logs VALIDATE CONSTRAINT decision_logs_expected_outcome_size;
ALTER TABLE public.decision_logs VALIDATE CONSTRAINT decision_logs_reflection_size;
ALTER TABLE public.emotion_logs VALIDATE CONSTRAINT emotion_logs_emotion_size;
ALTER TABLE public.emotion_logs VALIDATE CONSTRAINT emotion_logs_context_size;
ALTER TABLE public.focus_logs VALIDATE CONSTRAINT focus_logs_task_name_size;
ALTER TABLE public.focus_logs VALIDATE CONSTRAINT focus_logs_reflection_size;
ALTER TABLE public.goals VALIDATE CONSTRAINT goals_title_size;
ALTER TABLE public.goals VALIDATE CONSTRAINT goals_description_size;
ALTER TABLE public.goals VALIDATE CONSTRAINT goals_category_size;
ALTER TABLE public.projects VALIDATE CONSTRAINT projects_title_size;
ALTER TABLE public.projects VALIDATE CONSTRAINT projects_description_size;
ALTER TABLE public.tasks VALIDATE CONSTRAINT tasks_title_size;
ALTER TABLE public.tasks VALIDATE CONSTRAINT tasks_description_size;
ALTER TABLE public.tasks VALIDATE CONSTRAINT tasks_subtasks_size;
ALTER TABLE public.improvement_plans VALIDATE CONSTRAINT improvement_plans_title_size;
ALTER TABLE public.improvement_plans VALIDATE CONSTRAINT improvement_plans_description_size;
ALTER TABLE public.improvement_plans VALIDATE CONSTRAINT improvement_plans_category_size;
ALTER TABLE public.improvement_plans VALIDATE CONSTRAINT improvement_plans_review_cadence_size;
ALTER TABLE public.improvement_plans VALIDATE CONSTRAINT improvement_plans_steps_size;
ALTER TABLE public.user_plan_follows VALIDATE CONSTRAINT user_plan_follows_title_size;
ALTER TABLE public.user_plan_follows VALIDATE CONSTRAINT user_plan_follows_description_size;
ALTER TABLE public.user_plan_follows VALIDATE CONSTRAINT user_plan_follows_review_cadence_size;
ALTER TABLE public.user_plan_follows VALIDATE CONSTRAINT user_plan_follows_steps_size;
ALTER TABLE public.shared_challenges VALIDATE CONSTRAINT shared_challenges_title_size;
ALTER TABLE public.shared_challenges VALIDATE CONSTRAINT shared_challenges_target_habit_name_size;
ALTER TABLE public.shared_challenges VALIDATE CONSTRAINT shared_challenges_user1_target_size;
ALTER TABLE public.shared_challenges VALIDATE CONSTRAINT shared_challenges_user2_target_size;
ALTER TABLE public.shared_challenges VALIDATE CONSTRAINT shared_challenges_user1_done_dates_size;
ALTER TABLE public.shared_challenges VALIDATE CONSTRAINT shared_challenges_user2_done_dates_size;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_active_habits_size;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_stats_size;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_avatar_size;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_uid_format;

COMMIT;
