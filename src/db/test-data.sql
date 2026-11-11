-- Minimal data for database tests, applied after all migrations (profile 1 comes from the seed migration)
INSERT INTO `detection_profiles` (`id`, `name`, `sync_gap_sec`, `window_minutes`, `window_max_messages`, `min_text_length`, `sim_threshold`, `w_text`, `w_coactivity`, `w_cosharing`, `edge_threshold`, `keep_threshold`)
VALUES (2, 'Чутливий', 30, 15, 200, 8, 0.5, 0.5, 0.3, 0.2, 0.4, 0.1);

INSERT INTO `sources` (`id`, `kind`, `tg_chat_id`, `title`, `profile_id`, `is_active`, `created_at`) VALUES
  (1, 'telegram', -100123, 'Тестова група', 1, 1, 1757505600000),
  (2, 'upload', NULL, 'Демо-чат', 2, 1, 1757505700000);

INSERT INTO `participants` (`id`, `source_id`, `external_id`, `display_name`, `first_seen_at`, `message_count`) VALUES
  (1, 1, '42', 'Alice', 1757505600000, 2),
  (2, 1, '43', 'Bob', 1757505610000, 1),
  (3, 2, 'carol', 'Carol', 1757505700000, 1);

INSERT INTO `messages` (`id`, `source_id`, `participant_id`, `tg_message_id`, `sent_at`, `text`, `normalized_text`) VALUES
  (1, 1, 1, 1, 1757505600000, 'Голосуйте за Петренка!', 'голосуйте за петренка'),
  (2, 1, 2, 2, 1757505610000, 'Голосуйте за Петренка!', 'голосуйте за петренка'),
  (3, 1, 1, 3, 1757505900000, 'Хто йде на футбол?', 'хто йде на футбол'),
  (4, 2, 3, NULL, 1757505700000, 'Привіт усім', 'привіт усім');

INSERT INTO `snapshots` (`id`, `source_id`, `computed_at`, `window_start`, `window_end`) VALUES
  (1, 1, 1757505915000, 1757503800000, 1757505900000);

INSERT INTO `snapshot_groups` (`id`, `snapshot_id`, `score`, `member_count`) VALUES (1, 1, 0.8, 2);

INSERT INTO `group_members` (`snapshot_group_id`, `participant_id`) VALUES (1, 1), (1, 2);

INSERT INTO `pair_signals` (`id`, `snapshot_id`, `participant_a_id`, `participant_b_id`, `signal_kind`, `value`) VALUES
  (1, 1, 1, 2, 'text', 1),
  (2, 1, 1, 2, 'coactivity', 1);

INSERT INTO `evidence` (`id`, `pair_signal_id`, `message_a_id`, `message_b_id`) VALUES (1, 1, 1, 2);

INSERT INTO `findings` (`id`, `source_id`, `detected_at`, `group_key`, `score`, `snapshot_group_id`) VALUES
  (1, 1, 1757505915000, '1:2', 0.8, 1);

INSERT INTO `finding_members` (`finding_id`, `participant_id`) VALUES (1, 1), (1, 2);

INSERT INTO `window_metrics` (`id`, `source_id`, `window_start`, `window_end`, `max_score`, `group_count`, `flagged_participants`) VALUES
  (1, 1, 1757503800000, 1757505900000, 0.8, 1, 2);

INSERT INTO `admins` (`id`, `email`, `added_by`, `created_at`) VALUES
  (1, 'admin@example.com', NULL, 1757505600000);
