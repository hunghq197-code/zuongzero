CREATE TABLE `track_guarantees` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`track_title` text NOT NULL,
	`track_key` text NOT NULL,
	`initial_amount` real NOT NULL,
	`recouped_amount` real DEFAULT 0 NOT NULL,
	`balance_amount` real NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_track_guarantees_client_status` ON `track_guarantees` (`client_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_track_guarantees_client_track` ON `track_guarantees` (`client_id`,`track_key`);--> statement-breakpoint
CREATE TABLE `track_guarantee_recoupments` (
	`id` text PRIMARY KEY NOT NULL,
	`guarantee_id` text NOT NULL,
	`client_id` text NOT NULL,
	`report_period_id` text NOT NULL,
	`source_upload_id` text NOT NULL,
	`track_title` text NOT NULL,
	`revenue_amount` real NOT NULL,
	`amount` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`guarantee_id`) REFERENCES `track_guarantees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_period_id`) REFERENCES `report_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_track_recoupments_guarantee` ON `track_guarantee_recoupments` (`guarantee_id`);--> statement-breakpoint
CREATE INDEX `idx_track_recoupments_client_period` ON `track_guarantee_recoupments` (`client_id`,`report_period_id`);--> statement-breakpoint
CREATE INDEX `idx_track_recoupments_upload` ON `track_guarantee_recoupments` (`source_upload_id`);
