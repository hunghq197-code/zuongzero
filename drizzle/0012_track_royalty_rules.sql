CREATE TABLE `track_royalty_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`track_title` text NOT NULL,
	`track_external_id` text NOT NULL,
	`track_external_key` text NOT NULL,
	`royalty_rate_bps` integer NOT NULL,
	`effective_from_period` text NOT NULL,
	`effective_to_period` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_track_royalty_rules_client_status` ON `track_royalty_rules` (`client_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_track_royalty_rules_track_period` ON `track_royalty_rules` (`client_id`,`track_external_key`,`effective_from_period`,`effective_to_period`);
--> statement-breakpoint
ALTER TABLE `statement_line_items` ADD COLUMN `source_royalty_rate` real;
--> statement-breakpoint
ALTER TABLE `statement_line_items` ADD COLUMN `source_net_payable` real;
--> statement-breakpoint
ALTER TABLE `statement_line_items` ADD COLUMN `calculation_mode` text DEFAULT 'excel' NOT NULL;
--> statement-breakpoint
ALTER TABLE `statement_line_items` ADD COLUMN `royalty_rule_id` text;
--> statement-breakpoint
ALTER TABLE `statement_line_items` ADD COLUMN `applied_royalty_rate_bps` integer;
--> statement-breakpoint
UPDATE `statement_line_items`
SET `source_royalty_rate` = `royalty_rate`,
    `source_net_payable` = `net_payable`,
    `calculation_mode` = 'excel'
WHERE `source_net_payable` IS NULL;
