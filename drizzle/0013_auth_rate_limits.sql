CREATE TABLE `auth_rate_limits` (
  `bucket_key` text PRIMARY KEY NOT NULL,
  `request_count` integer NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_rate_limits_expires` ON `auth_rate_limits` (`expires_at`);
