-- CreateEnum
CREATE TYPE "LeakReclaimStatus" AS ENUM ('TRANSFERRED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "GoalContributionSource" ADD VALUE 'LEAK_RECLAIM';

-- CreateTable
CREATE TABLE "leak_reclaims" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "computed_amount" DECIMAL(12,2) NOT NULL,
    "transfer_amount" DECIMAL(12,2),
    "status" "LeakReclaimStatus" NOT NULL,
    "contribution_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leak_reclaims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leak_reclaims_contribution_id_key" ON "leak_reclaims"("contribution_id");

-- CreateIndex
CREATE UNIQUE INDEX "leak_reclaims_user_id_year_month_key" ON "leak_reclaims"("user_id", "year", "month");

-- AddForeignKey
ALTER TABLE "leak_reclaims" ADD CONSTRAINT "leak_reclaims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leak_reclaims" ADD CONSTRAINT "leak_reclaims_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "goal_contributions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
