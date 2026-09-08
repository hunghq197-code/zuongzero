CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`client_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`ip_hash` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_client_created` ON `audit_logs` (`client_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_actor_created` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_target` ON `audit_logs` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `client_users` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_level` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_client_users_client` ON `client_users` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_client_users_user` ON `client_users` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_client_users_user_status` ON `client_users` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`legal_name` text NOT NULL,
	`display_name` text NOT NULL,
	`default_currency` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_code_unique` ON `clients` (`code`);--> statement-breakpoint
CREATE INDEX `idx_clients_status` ON `clients` (`status`);--> statement-breakpoint
CREATE INDEX `idx_clients_code` ON `clients` (`code`);--> statement-breakpoint
CREATE TABLE `report_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`period` text NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`published_at` text,
	`locked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_report_periods_client_period` ON `report_periods` (`client_id`,`period`);--> statement-breakpoint
CREATE INDEX `idx_report_periods_status` ON `report_periods` (`status`);--> statement-breakpoint
CREATE TABLE `revenue_breakdowns` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`report_period_id` text NOT NULL,
	`dimension` text NOT NULL,
	`label` text NOT NULL,
	`value` real NOT NULL,
	`percentage` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_period_id`) REFERENCES `report_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_breakdowns_client_period_dimension` ON `revenue_breakdowns` (`client_id`,`report_period_id`,`dimension`);--> statement-breakpoint
CREATE TABLE `statements` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`report_period_id` text NOT NULL,
	`source_upload_id` text NOT NULL,
	`opening_balance` real NOT NULL,
	`gross_revenue` real NOT NULL,
	`net_revenue` real NOT NULL,
	`net_costs` real NOT NULL,
	`reserves_withheld` real NOT NULL,
	`reserves_released` real NOT NULL,
	`closing_balance` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_period_id`) REFERENCES `report_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_statements_client_period` ON `statements` (`client_id`,`report_period_id`);--> statement-breakpoint
CREATE INDEX `idx_statements_source_upload` ON `statements` (`source_upload_id`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`report_period_id` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`original_filename` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`status` text NOT NULL,
	`validation_summary` text,
	`replaced_upload_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_period_id`) REFERENCES `report_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_object_key_unique` ON `uploads` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_uploads_client_period` ON `uploads` (`client_id`,`report_period_id`);--> statement-breakpoint
CREATE INDEX `idx_uploads_status` ON `uploads` (`status`);--> statement-breakpoint
CREATE INDEX `idx_uploads_uploaded_by` ON `uploads` (`uploaded_by_user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_role_status` ON `users` (`role`,`status`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);