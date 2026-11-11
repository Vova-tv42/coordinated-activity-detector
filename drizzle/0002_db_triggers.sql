CREATE TRIGGER `detection_profiles_validate_insert`
BEFORE INSERT ON `detection_profiles`
WHEN NEW.`sync_gap_sec` < 1
  OR NEW.`window_minutes` < 1
  OR NEW.`window_max_messages` < 1
  OR NEW.`min_text_length` < 0
  OR NEW.`sim_threshold` NOT BETWEEN 0 AND 1
  OR NEW.`w_text` NOT BETWEEN 0 AND 1
  OR NEW.`w_coactivity` NOT BETWEEN 0 AND 1
  OR NEW.`w_cosharing` NOT BETWEEN 0 AND 1
  OR NEW.`edge_threshold` NOT BETWEEN 0 AND 1
  OR NEW.`keep_threshold` NOT BETWEEN 0 AND 1
BEGIN
  SELECT RAISE(ABORT, 'detection profile values are out of range');
END;
--> statement-breakpoint
CREATE TRIGGER `detection_profiles_validate_update`
BEFORE UPDATE ON `detection_profiles`
WHEN NEW.`sync_gap_sec` < 1
  OR NEW.`window_minutes` < 1
  OR NEW.`window_max_messages` < 1
  OR NEW.`min_text_length` < 0
  OR NEW.`sim_threshold` NOT BETWEEN 0 AND 1
  OR NEW.`w_text` NOT BETWEEN 0 AND 1
  OR NEW.`w_coactivity` NOT BETWEEN 0 AND 1
  OR NEW.`w_cosharing` NOT BETWEEN 0 AND 1
  OR NEW.`edge_threshold` NOT BETWEEN 0 AND 1
  OR NEW.`keep_threshold` NOT BETWEEN 0 AND 1
BEGIN
  SELECT RAISE(ABORT, 'detection profile values are out of range');
END;
--> statement-breakpoint
CREATE TRIGGER `detection_profiles_keep_default_on_delete`
BEFORE DELETE ON `detection_profiles`
WHEN OLD.`name` = 'Стандартний'
BEGIN
  SELECT RAISE(ABORT, 'default detection profile cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `detection_profiles_keep_default_name`
BEFORE UPDATE OF `name` ON `detection_profiles`
WHEN OLD.`name` = 'Стандартний' AND NEW.`name` <> OLD.`name`
BEGIN
  SELECT RAISE(ABORT, 'default detection profile cannot be renamed');
END;
--> statement-breakpoint
CREATE TRIGGER `sources_validate_kind_insert`
BEFORE INSERT ON `sources`
WHEN NEW.`kind` NOT IN ('telegram', 'upload')
BEGIN
  SELECT RAISE(ABORT, 'source kind must be telegram or upload');
END;
--> statement-breakpoint
CREATE TRIGGER `sources_validate_kind_update`
BEFORE UPDATE OF `kind` ON `sources`
WHEN NEW.`kind` NOT IN ('telegram', 'upload')
BEGIN
  SELECT RAISE(ABORT, 'source kind must be telegram or upload');
END;
--> statement-breakpoint
CREATE TRIGGER `messages_participant_from_same_source`
BEFORE INSERT ON `messages`
WHEN (SELECT `source_id` FROM `participants` WHERE `id` = NEW.`participant_id`) <> NEW.`source_id`
BEGIN
  SELECT RAISE(ABORT, 'message participant belongs to another source');
END;
--> statement-breakpoint
CREATE TRIGGER `pair_signals_validate_kind`
BEFORE INSERT ON `pair_signals`
WHEN NEW.`signal_kind` NOT IN ('text', 'coactivity', 'cosharing')
BEGIN
  SELECT RAISE(ABORT, 'signal kind must be text, coactivity or cosharing');
END;
