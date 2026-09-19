ALTER TABLE `report_periods` ADD COLUMN `payment_status` text DEFAULT 'unpaid' NOT NULL;
--> statement-breakpoint
ALTER TABLE `report_periods` ADD COLUMN `paid_at` text;
--> statement-breakpoint
ALTER TABLE `report_periods` ADD COLUMN `paid_by_user_id` text REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_report_periods_payment_status` ON `report_periods` (`payment_status`);
