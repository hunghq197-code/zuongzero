DROP INDEX `idx_report_periods_unique_client_period`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_report_periods_unique_client_period_currency` ON `report_periods` (`client_id`,`period`,`currency`);--> statement-breakpoint
ALTER TABLE `revenue_breakdowns` ADD `units` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `revenue_breakdowns` ADD `row_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `statements` ADD `units` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `statements` ADD `row_count` integer DEFAULT 0 NOT NULL;