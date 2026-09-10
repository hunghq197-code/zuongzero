CREATE TABLE `auth_login_otps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`challenge_token_hash` text NOT NULL,
	`code_hash` text NOT NULL,
	`return_to` text NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`user_agent_hash` text,
	`ip_hash` text,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_login_otps_challenge` ON `auth_login_otps` (`challenge_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_auth_login_otps_user_status` ON `auth_login_otps` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_auth_login_otps_expires` ON `auth_login_otps` (`expires_at`);