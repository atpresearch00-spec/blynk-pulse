CREATE TABLE `defrost_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`device_key` text NOT NULL,
	`start_observed_at` integer NOT NULL,
	`end_observed_at` integer,
	`last_observed_at` integer NOT NULL,
	`target_seconds` integer,
	`partial_start` integer NOT NULL,
	`has_gaps` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `defrost_device_start_idx` ON `defrost_cycles` (`device_key`,`start_observed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `defrost_one_open_cycle` ON `defrost_cycles` (`device_key`) WHERE "defrost_cycles"."end_observed_at" IS NULL;--> statement-breakpoint
CREATE TABLE `defrost_state` (
	`device_key` text PRIMARY KEY NOT NULL,
	`last_signal` integer,
	`last_fetched_at` integer NOT NULL
);

--> statement-breakpoint
-- Observed transitions only; all statements are atomic with the snapshot write.
CREATE TRIGGER `defrost_saved_devices_insert` AFTER INSERT ON `saved_devices`
WHEN NEW.snapshot IS NOT NULL AND json_valid(NEW.snapshot)
 AND json_extract(NEW.snapshot, '$.fetchedAt') > coalesce((SELECT last_fetched_at FROM defrost_state WHERE device_key = 'device:' || NEW.id),-1)
BEGIN
 INSERT INTO defrost_state (device_key,last_signal,last_fetched_at) SELECT 'device:' || NEW.id,NULL,-1 WHERE NOT EXISTS (SELECT 1 FROM defrost_state WHERE device_key = 'device:' || NEW.id);
 UPDATE defrost_cycles SET has_gaps = 1
 WHERE device_key = 'device:' || NEW.id AND end_observed_at IS NULL
 AND (json_extract(NEW.snapshot, '$.defrostSignal') IS NULL OR json_extract(NEW.snapshot, '$.fetchedAt') - last_observed_at > max(coalesce(json_extract(NEW.snapshot, '$.refreshSeconds'),5)*3,45)*1000);
 UPDATE defrost_cycles SET end_observed_at = json_extract(NEW.snapshot, '$.fetchedAt'), last_observed_at = json_extract(NEW.snapshot, '$.fetchedAt')
 WHERE device_key = 'device:' || NEW.id AND end_observed_at IS NULL AND json_extract(NEW.snapshot, '$.defrostSignal') = 1;
 INSERT INTO defrost_cycles (id,device_key,start_observed_at,end_observed_at,last_observed_at,target_seconds,partial_start,has_gaps)
 SELECT 'device:' || NEW.id || '/' || CAST(json_extract(NEW.snapshot, '$.fetchedAt') AS TEXT),'device:' || NEW.id,json_extract(NEW.snapshot, '$.fetchedAt'),NULL,json_extract(NEW.snapshot, '$.fetchedAt'),json_extract(NEW.snapshot,'$.defrostTargetSeconds'),
  CASE WHEN (SELECT last_signal FROM defrost_state WHERE device_key = 'device:' || NEW.id) IS NOT 1
   OR json_extract(NEW.snapshot, '$.fetchedAt') - (SELECT last_fetched_at FROM defrost_state WHERE device_key = 'device:' || NEW.id) > max(coalesce(json_extract(NEW.snapshot, '$.refreshSeconds'),5)*3,45)*1000 THEN 1 ELSE 0 END,0
 WHERE json_extract(NEW.snapshot, '$.defrostSignal') = 0 AND NOT EXISTS (SELECT 1 FROM defrost_cycles WHERE device_key = 'device:' || NEW.id AND end_observed_at IS NULL);
 UPDATE defrost_cycles SET last_observed_at = json_extract(NEW.snapshot, '$.fetchedAt')
 WHERE device_key = 'device:' || NEW.id AND end_observed_at IS NULL AND json_extract(NEW.snapshot, '$.defrostSignal') = 0;
 UPDATE defrost_state SET last_signal = json_extract(NEW.snapshot, '$.defrostSignal'),last_fetched_at = json_extract(NEW.snapshot, '$.fetchedAt') WHERE device_key = 'device:' || NEW.id;
END;

--> statement-breakpoint
-- Observed transitions only; all statements are atomic with the snapshot write.
CREATE TRIGGER `defrost_saved_devices_update` AFTER UPDATE OF snapshot ON `saved_devices`
WHEN NEW.snapshot IS NOT NULL AND json_valid(NEW.snapshot)
 AND json_extract(NEW.snapshot, '$.fetchedAt') > coalesce((SELECT last_fetched_at FROM defrost_state WHERE device_key = 'device:' || NEW.id),-1)
BEGIN
 INSERT INTO defrost_state (device_key,last_signal,last_fetched_at) SELECT 'device:' || NEW.id,NULL,-1 WHERE NOT EXISTS (SELECT 1 FROM defrost_state WHERE device_key = 'device:' || NEW.id);
 UPDATE defrost_cycles SET has_gaps = 1
 WHERE device_key = 'device:' || NEW.id AND end_observed_at IS NULL
 AND (json_extract(NEW.snapshot, '$.defrostSignal') IS NULL OR json_extract(NEW.snapshot, '$.fetchedAt') - last_observed_at > max(coalesce(json_extract(NEW.snapshot, '$.refreshSeconds'),5)*3,45)*1000);
 UPDATE defrost_cycles SET end_observed_at = json_extract(NEW.snapshot, '$.fetchedAt'), last_observed_at = json_extract(NEW.snapshot, '$.fetchedAt')
 WHERE device_key = 'device:' || NEW.id AND end_observed_at IS NULL AND json_extract(NEW.snapshot, '$.defrostSignal') = 1;
 INSERT INTO defrost_cycles (id,device_key,start_observed_at,end_observed_at,last_observed_at,target_seconds,partial_start,has_gaps)
 SELECT 'device:' || NEW.id || '/' || CAST(json_extract(NEW.snapshot, '$.fetchedAt') AS TEXT),'device:' || NEW.id,json_extract(NEW.snapshot, '$.fetchedAt'),NULL,json_extract(NEW.snapshot, '$.fetchedAt'),json_extract(NEW.snapshot,'$.defrostTargetSeconds'),
  CASE WHEN (SELECT last_signal FROM defrost_state WHERE device_key = 'device:' || NEW.id) IS NOT 1
   OR json_extract(NEW.snapshot, '$.fetchedAt') - (SELECT last_fetched_at FROM defrost_state WHERE device_key = 'device:' || NEW.id) > max(coalesce(json_extract(NEW.snapshot, '$.refreshSeconds'),5)*3,45)*1000 THEN 1 ELSE 0 END,0
 WHERE json_extract(NEW.snapshot, '$.defrostSignal') = 0 AND NOT EXISTS (SELECT 1 FROM defrost_cycles WHERE device_key = 'device:' || NEW.id AND end_observed_at IS NULL);
 UPDATE defrost_cycles SET last_observed_at = json_extract(NEW.snapshot, '$.fetchedAt')
 WHERE device_key = 'device:' || NEW.id AND end_observed_at IS NULL AND json_extract(NEW.snapshot, '$.defrostSignal') = 0;
 UPDATE defrost_state SET last_signal = json_extract(NEW.snapshot, '$.defrostSignal'),last_fetched_at = json_extract(NEW.snapshot, '$.fetchedAt') WHERE device_key = 'device:' || NEW.id;
END;

--> statement-breakpoint
-- Observed transitions only; all statements are atomic with the snapshot write.
CREATE TRIGGER `defrost_shared_dashboard_insert` AFTER INSERT ON `shared_dashboard`
WHEN NEW.snapshot IS NOT NULL AND json_valid(NEW.snapshot)
 AND json_extract(NEW.snapshot, '$.fetchedAt') > coalesce((SELECT last_fetched_at FROM defrost_state WHERE device_key = 'legacy'),-1)
BEGIN
 INSERT INTO defrost_state (device_key,last_signal,last_fetched_at) SELECT 'legacy',NULL,-1 WHERE NOT EXISTS (SELECT 1 FROM defrost_state WHERE device_key = 'legacy');
 UPDATE defrost_cycles SET has_gaps = 1
 WHERE device_key = 'legacy' AND end_observed_at IS NULL
 AND (json_extract(NEW.snapshot, '$.defrostSignal') IS NULL OR json_extract(NEW.snapshot, '$.fetchedAt') - last_observed_at > max(coalesce(json_extract(NEW.snapshot, '$.refreshSeconds'),5)*3,45)*1000);
 UPDATE defrost_cycles SET end_observed_at = json_extract(NEW.snapshot, '$.fetchedAt'), last_observed_at = json_extract(NEW.snapshot, '$.fetchedAt')
 WHERE device_key = 'legacy' AND end_observed_at IS NULL AND json_extract(NEW.snapshot, '$.defrostSignal') = 1;
 INSERT INTO defrost_cycles (id,device_key,start_observed_at,end_observed_at,last_observed_at,target_seconds,partial_start,has_gaps)
 SELECT 'legacy' || '/' || CAST(json_extract(NEW.snapshot, '$.fetchedAt') AS TEXT),'legacy',json_extract(NEW.snapshot, '$.fetchedAt'),NULL,json_extract(NEW.snapshot, '$.fetchedAt'),json_extract(NEW.snapshot,'$.defrostTargetSeconds'),
  CASE WHEN (SELECT last_signal FROM defrost_state WHERE device_key = 'legacy') IS NOT 1
   OR json_extract(NEW.snapshot, '$.fetchedAt') - (SELECT last_fetched_at FROM defrost_state WHERE device_key = 'legacy') > max(coalesce(json_extract(NEW.snapshot, '$.refreshSeconds'),5)*3,45)*1000 THEN 1 ELSE 0 END,0
 WHERE json_extract(NEW.snapshot, '$.defrostSignal') = 0 AND NOT EXISTS (SELECT 1 FROM defrost_cycles WHERE device_key = 'legacy' AND end_observed_at IS NULL);
 UPDATE defrost_cycles SET last_observed_at = json_extract(NEW.snapshot, '$.fetchedAt')
 WHERE device_key = 'legacy' AND end_observed_at IS NULL AND json_extract(NEW.snapshot, '$.defrostSignal') = 0;
 UPDATE defrost_state SET last_signal = json_extract(NEW.snapshot, '$.defrostSignal'),last_fetched_at = json_extract(NEW.snapshot, '$.fetchedAt') WHERE device_key = 'legacy';
END;

--> statement-breakpoint
-- Observed transitions only; all statements are atomic with the snapshot write.
CREATE TRIGGER `defrost_shared_dashboard_update` AFTER UPDATE OF snapshot ON `shared_dashboard`
WHEN NEW.snapshot IS NOT NULL AND json_valid(NEW.snapshot)
 AND json_extract(NEW.snapshot, '$.fetchedAt') > coalesce((SELECT last_fetched_at FROM defrost_state WHERE device_key = 'legacy'),-1)
BEGIN
 INSERT INTO defrost_state (device_key,last_signal,last_fetched_at) SELECT 'legacy',NULL,-1 WHERE NOT EXISTS (SELECT 1 FROM defrost_state WHERE device_key = 'legacy');
 UPDATE defrost_cycles SET has_gaps = 1
 WHERE device_key = 'legacy' AND end_observed_at IS NULL
 AND (json_extract(NEW.snapshot, '$.defrostSignal') IS NULL OR json_extract(NEW.snapshot, '$.fetchedAt') - last_observed_at > max(coalesce(json_extract(NEW.snapshot, '$.refreshSeconds'),5)*3,45)*1000);
 UPDATE defrost_cycles SET end_observed_at = json_extract(NEW.snapshot, '$.fetchedAt'), last_observed_at = json_extract(NEW.snapshot, '$.fetchedAt')
 WHERE device_key = 'legacy' AND end_observed_at IS NULL AND json_extract(NEW.snapshot, '$.defrostSignal') = 1;
 INSERT INTO defrost_cycles (id,device_key,start_observed_at,end_observed_at,last_observed_at,target_seconds,partial_start,has_gaps)
 SELECT 'legacy' || '/' || CAST(json_extract(NEW.snapshot, '$.fetchedAt') AS TEXT),'legacy',json_extract(NEW.snapshot, '$.fetchedAt'),NULL,json_extract(NEW.snapshot, '$.fetchedAt'),json_extract(NEW.snapshot,'$.defrostTargetSeconds'),
  CASE WHEN (SELECT last_signal FROM defrost_state WHERE device_key = 'legacy') IS NOT 1
   OR json_extract(NEW.snapshot, '$.fetchedAt') - (SELECT last_fetched_at FROM defrost_state WHERE device_key = 'legacy') > max(coalesce(json_extract(NEW.snapshot, '$.refreshSeconds'),5)*3,45)*1000 THEN 1 ELSE 0 END,0
 WHERE json_extract(NEW.snapshot, '$.defrostSignal') = 0 AND NOT EXISTS (SELECT 1 FROM defrost_cycles WHERE device_key = 'legacy' AND end_observed_at IS NULL);
 UPDATE defrost_cycles SET last_observed_at = json_extract(NEW.snapshot, '$.fetchedAt')
 WHERE device_key = 'legacy' AND end_observed_at IS NULL AND json_extract(NEW.snapshot, '$.defrostSignal') = 0;
 UPDATE defrost_state SET last_signal = json_extract(NEW.snapshot, '$.defrostSignal'),last_fetched_at = json_extract(NEW.snapshot, '$.fetchedAt') WHERE device_key = 'legacy';
END;
