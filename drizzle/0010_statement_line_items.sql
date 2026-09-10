CREATE TABLE IF NOT EXISTS `statement_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`report_period_id` text NOT NULL,
	`source_upload_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`account_no` text NOT NULL,
	`contract_name` text,
	`content_type` text,
	`start_date` text,
	`period_end_date` text,
	`release_title` text,
	`release_artist` text,
	`isrc` text,
	`track_title` text,
	`track_version` text,
	`track_artist` text,
	`sales_period` text,
	`release_label` text,
	`territory` text,
	`distribution_channel` text,
	`configuration` text,
	`partner` text,
	`sales` real DEFAULT 0 NOT NULL,
	`gross_income` real,
	`royalty_rate` real,
	`net_payable` real NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_period_id`) REFERENCES `report_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_statement_line_items_period` ON `statement_line_items` (`report_period_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_statement_line_items_client_period` ON `statement_line_items` (`client_id`,`report_period_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_statement_line_items_upload` ON `statement_line_items` (`source_upload_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_statement_line_items_isrc` ON `statement_line_items` (`client_id`,`isrc`);
