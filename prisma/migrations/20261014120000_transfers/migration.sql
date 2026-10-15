-- Transfers between the user's own wallets. They move balances through the
-- ledger and are not income or expense.

CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "to_account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "occurred_at" DATE NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transfers_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "transfers_different_wallets" CHECK ("from_account_id" <> "to_account_id")
);

CREATE INDEX "transfers_user_id_is_deleted_occurred_at_idx" ON "transfers"("user_id", "is_deleted", "occurred_at");
CREATE INDEX "transfers_from_account_id_idx" ON "transfers"("from_account_id");
CREATE INDEX "transfers_to_account_id_idx" ON "transfers"("to_account_id");

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_id_fkey"
  FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_id_fkey"
  FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
