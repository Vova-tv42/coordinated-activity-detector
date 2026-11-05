CREATE TABLE `admins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`added_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_email_unique` ON `admins` (`email`);--> statement-breakpoint
CREATE TABLE `detection_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sync_gap_sec` integer NOT NULL,
	`window_minutes` integer NOT NULL,
	`window_max_messages` integer NOT NULL,
	`min_text_length` integer NOT NULL,
	`sim_threshold` real NOT NULL,
	`w_text` real NOT NULL,
	`w_coactivity` real NOT NULL,
	`w_cosharing` real NOT NULL,
	`edge_threshold` real NOT NULL,
	`keep_threshold` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `detection_profiles_name_unique` ON `detection_profiles` (`name`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pair_signal_id` integer NOT NULL,
	`message_a_id` integer NOT NULL,
	`message_b_id` integer NOT NULL,
	FOREIGN KEY (`pair_signal_id`) REFERENCES `pair_signals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_a_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_b_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `finding_members` (
	`finding_id` integer NOT NULL,
	`participant_id` integer NOT NULL,
	PRIMARY KEY(`finding_id`, `participant_id`),
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`detected_at` integer NOT NULL,
	`group_key` text NOT NULL,
	`score` real NOT NULL,
	`snapshot_group_id` integer,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_group_id`) REFERENCES `snapshot_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `findings_source_id_detected_at_idx` ON `findings` (`source_id`,`detected_at`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`snapshot_group_id` integer NOT NULL,
	`participant_id` integer NOT NULL,
	PRIMARY KEY(`snapshot_group_id`, `participant_id`),
	FOREIGN KEY (`snapshot_group_id`) REFERENCES `snapshot_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`participant_id` integer NOT NULL,
	`tg_message_id` integer,
	`sent_at` integer NOT NULL,
	`text` text NOT NULL,
	`normalized_text` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_source_id_sent_at_idx` ON `messages` (`source_id`,`sent_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_source_id_tg_message_id_unique` ON `messages` (`source_id`,`tg_message_id`);--> statement-breakpoint
CREATE TABLE `pair_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`participant_a_id` integer NOT NULL,
	`participant_b_id` integer NOT NULL,
	`signal_kind` text NOT NULL,
	`value` real NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_a_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_b_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pair_signals_snapshot_id_idx` ON `pair_signals` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`external_id` text NOT NULL,
	`display_name` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_source_id_external_id_unique` ON `participants` (`source_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `snapshot_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`score` real NOT NULL,
	`member_count` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`computed_at` integer NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`tg_chat_id` integer,
	`title` text NOT NULL,
	`profile_id` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `detection_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_tg_chat_id_unique` ON `sources` (`tg_chat_id`);--> statement-breakpoint
CREATE TABLE `window_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`max_score` real NOT NULL,
	`group_count` integer NOT NULL,
	`flagged_participants` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `window_metrics_source_id_window_start_idx` ON `window_metrics` (`source_id`,`window_start`);