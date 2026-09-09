CREATE TABLE `account_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_invites_token_hash` ON `account_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_account_invites_user_status` ON `account_invites` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_account_invites_email_status` ON `account_invites` (`email`,`status`);--> statement-breakpoint
ALTER TABLE `users` ADD `company_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` text;