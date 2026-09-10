CREATE TABLE `settlement_reminder_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`period` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`error_message` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `settlement_reminder_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_settlement_reminder_deliveries_run` ON `settlement_reminder_deliveries` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_settlement_reminder_deliveries_client` ON `settlement_reminder_deliveries` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_settlement_reminder_deliveries_email_period` ON `settlement_reminder_deliveries` (`email`,`period`);--> statement-breakpoint
CREATE TABLE `settlement_reminder_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`reminder_date` text NOT NULL,
	`run_type` text NOT NULL,
	`status` text NOT NULL,
	`requested_by_user_id` text,
	`target_count` integer DEFAULT 0 NOT NULL,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`not_configured_count` integer DEFAULT 0 NOT NULL,
	`error_summary` text,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_settlement_reminder_runs_period_date` ON `settlement_reminder_runs` (`period`,`reminder_date`);--> statement-breakpoint
CREATE INDEX `idx_settlement_reminder_runs_created` ON `settlement_reminder_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_settlement_reminder_runs_status` ON `settlement_reminder_runs` (`status`);