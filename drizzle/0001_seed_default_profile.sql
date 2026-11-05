INSERT INTO `detection_profiles` (
	`name`,
	`sync_gap_sec`,
	`window_minutes`,
	`window_max_messages`,
	`min_text_length`,
	`sim_threshold`,
	`w_text`,
	`w_coactivity`,
	`w_cosharing`,
	`edge_threshold`,
	`keep_threshold`
) VALUES ('Стандартний', 60, 30, 500, 12, 0.6, 0.5, 0.3, 0.2, 0.5, 0.2);
