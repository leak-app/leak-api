-- Investment wallets: balances the user enters by hand. The difference to the
-- ledger balance is profit or loss and is applied to the wallet by the ledger.

CREATE TYPE "ValuationKind" AS ENUM ('BASELINE', 'UPDATE');

CREATE TABLE "account_valuations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "ValuationKind" NOT NULL,
    "valued_at" DATE NOT NULL,
    "previous_balance" DECIMAL(12,2) NOT NULL,
    "net_flow" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "gain" DECIMAL(12,2) NOT NULL,
    "adjustment" DECIMAL(12,2) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_valuations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_valuations_balance_non_negative" CHECK ("balance" >= 0)
);

CREATE INDEX "account_valuations_account_id_is_deleted_created_at_idx" ON "account_valuations"("account_id", "is_deleted", "created_at");
CREATE INDEX "account_valuations_user_id_valued_at_idx" ON "account_valuations"("user_id", "valued_at");

ALTER TABLE "account_valuations" ADD CONSTRAINT "account_valuations_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_valuations" ADD CONSTRAINT "account_valuations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
