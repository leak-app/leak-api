-- Ledger integrity: link transactions to wallets, soft deletes, balance recompute.
-- Prisma runs this file in a single transaction.

-- 1. New columns (account_id nullable until backfilled)
ALTER TABLE "accounts"
  ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deleted_at" TIMESTAMP(3);

ALTER TABLE "transactions"
  ADD COLUMN "account_id" TEXT,
  ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deleted_at" TIMESTAMP(3);

-- 2. Default "Tiền mặt" wallet for every user without a LIQUID wallet
-- NOTE: "accounts" balance columns are camelCase in the DB ("initialBalance",
-- "currentBalance"), matching the unmapped Prisma field names.
INSERT INTO "accounts" ("id", "name", "type", "initialBalance", "currentBalance", "user_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'Tiền mặt', 'LIQUID', 0, 0, u."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" a WHERE a."user_id" = u."id" AND a."type" = 'LIQUID'
);

-- 3. Backfill every transaction to its user's oldest LIQUID wallet
UPDATE "transactions" t
SET "account_id" = (
  SELECT a."id" FROM "accounts" a
  WHERE a."user_id" = t."user_id" AND a."type" = 'LIQUID'
  ORDER BY a."created_at" ASC, a."id" ASC
  LIMIT 1
);

-- 4. Enforce the link
ALTER TABLE "transactions" ALTER COLUMN "account_id" SET NOT NULL;

CREATE INDEX "accounts_user_id_is_deleted_idx" ON "accounts"("user_id", "is_deleted");
CREATE INDEX "transactions_user_id_is_deleted_created_at_idx" ON "transactions"("user_id", "is_deleted", "created_at");
CREATE INDEX "transactions_account_id_idx" ON "transactions"("account_id");

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Recompute every balance from the ledger (fixes stale or hand-edited balances)
UPDATE "accounts" a
SET "currentBalance" = a."initialBalance" + COALESCE((
  SELECT SUM(CASE WHEN t."type" = 'INCOME' THEN t."amount" ELSE -t."amount" END)
  FROM "transactions" t
  WHERE t."account_id" = a."id"
), 0);
