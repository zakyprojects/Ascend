-- Move the waiting-timezones cron off minute 0, where it shared the start with
-- ascend-season-rollover-hourly (run times correlated 0.98). Still runs before
-- ascend-penalties-hourly at minute 5. Re-scheduling by name keeps the job id.
SELECT cron.schedule('ascend-waiting-timezones-hourly', '1 * * * *', 'SELECT public.ascend_apply_waiting_timezones()');
