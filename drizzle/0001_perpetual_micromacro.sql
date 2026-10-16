CREATE TABLE `device_selection` (
	`id` integer PRIMARY KEY NOT NULL,
	`active_device_id` text,
	`selection_id` text NOT NULL,
	FOREIGN KEY (`active_device_id`) REFERENCES `saved_devices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `saved_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_ciphertext` text NOT NULL,
	`token_hash` text NOT NULL,
	`metrics` text DEFAULT '{}' NOT NULL,
	`snapshot` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_devices_token_hash_unique` ON `saved_devices` (`token_hash`);