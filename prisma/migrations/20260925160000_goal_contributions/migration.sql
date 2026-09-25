-- Goals: snake_case money columns, soft delete, target date, emoji,
-- and an append-only contributions ledger. Prisma runs this in one transaction.

-- 1. Goal columns (RENAME is metadata-only in PostgreSQL)
ALTER TABLE "goals" RENAME COLUMN "targetAmount" TO "target_amount";
ALTER TABLE "goals" RENAME COLUMN "savedAmount" TO "saved_amount";
ALTER TABLE "goals" ALTER COLUMN "saved_amount" SET DEFAULT 0;
ALTER TABLE "goals"
  ADD COLUMN "emoji" TEXT,
  ADD COLUMN "target_date" DATE,
  ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "goals" ADD CONSTRAINT "goals_saved_amount_non_negative" CHECK ("saved_amount" >= 0);
CREATE INDEX "goals_user_id_is_deleted_idx" ON "goals"("user_id", "is_deleted");

-- 2. Contributions
CREATE TYPE "GoalContributionType" AS ENUM ('OPENING', 'DEPOSIT', 'WITHDRAWAL');
CREATE TYPE "GoalContributionSource" AS ENUM ('MANUAL');

CREATE TABLE "goal_contributions" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "account_id" TEXT,
    "user_id" TEXT NOT NULL,
    "type" "GoalContributionType" NOT NULL,
    "source" "GoalContributionSource" NOT NULL DEFAULT 'MANUAL',
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goal_contributions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goal_contributions_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "goal_contributions_wallet_required" CHECK ("type" = 'OPENING' OR "account_id" IS NOT NULL)
);

CREATE INDEX "goal_contributions_goal_id_created_at_idx" ON "goal_contributions"("goal_id", "created_at");
CREATE INDEX "goal_contributions_account_id_idx" ON "goal_contributions"("account_id");

ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_fkey"
  FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Existing saved amounts become OPENING contributions. They were never taken
--    from a wallet, so no balance moves.
INSERT INTO "goal_contributions" ("id", "goal_id", "account_id", "user_id", "type", "source", "amount", "created_at")
SELECT 'opening_' || g."id", g."id", NULL, g."user_id", 'OPENING', 'MANUAL', g."saved_amount", g."created_at"
FROM "goals" g
WHERE g."saved_amount" > 0;
