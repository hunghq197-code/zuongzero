CREATE TABLE `access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_user_id` text NOT NULL,
	`requester_email` text NOT NULL,
	`request_type` text NOT NULL,
	`company_name` text,
	`client_code` text,
	`contact_name` text,
	`reason` text,
	`status` text NOT NULL,
	`metadata` text,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`requester_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_access_requests_requester` ON `access_requests` (`requester_user_id`);--> statement-breakpoint
CREATE INDEX `idx_access_requests_status_created` ON `access_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_access_requests_type_status` ON `access_requests` (`request_type`,`status`);