-- Rename the wallet balance columns to snake_case like every other column.
-- Hand-written: a generated migration would drop and re-add the columns and lose data.
-- RENAME COLUMN is a metadata-only change in PostgreSQL.
ALTER TABLE "accounts" RENAME COLUMN "initialBalance" TO "initial_balance";
ALTER TABLE "accounts" RENAME COLUMN "currentBalance" TO "current_balance";
