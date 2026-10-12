CREATE TABLE `client_write_locks` (
  `client_id` text PRIMARY KEY NOT NULL,
  `owner_token` text NOT NULL,
  `expires_at` integer NOT NULL
);
