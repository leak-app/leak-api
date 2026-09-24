-- CreateEnum
CREATE TYPE "SpendOutcome" AS ENUM ('UNREVIEWED', 'WORTH_IT', 'NEUTRAL', 'LEAK');

-- CreateEnum
CREATE TYPE "LeakReason" AS ENUM ('IMPULSIVE', 'UNUSED', 'OVERPRICED', 'SOCIAL_PRESSURE', 'FORGOTTEN_SUB', 'OTHER');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "leak_reason" "LeakReason",
ADD COLUMN     "outcome" "SpendOutcome" NOT NULL DEFAULT 'UNREVIEWED',
ADD COLUMN     "reviewed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "transactions_user_id_outcome_created_at_idx" ON "transactions"("user_id", "outcome", "created_at");
