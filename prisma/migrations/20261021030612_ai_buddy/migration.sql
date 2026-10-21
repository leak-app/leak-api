-- CreateEnum
CREATE TYPE "CommentSentiment" AS ENUM ('ROAST', 'PRAISE', 'NUDGE');

-- CreateEnum
CREATE TYPE "BuddyMode" AS ENUM ('SAVAGE', 'GENTLE', 'MUTE');

-- CreateEnum
CREATE TYPE "AiCommentJobStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "ai_comment" TEXT,
ADD COLUMN     "ai_sentiment" "CommentSentiment";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "buddy_mode" "BuddyMode" NOT NULL DEFAULT 'SAVAGE';

-- CreateTable
CREATE TABLE "ai_comment_jobs" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "AiCommentJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_comment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_comment_jobs_transaction_id_key" ON "ai_comment_jobs"("transaction_id");

-- CreateIndex
CREATE INDEX "ai_comment_jobs_status_next_attempt_at_idx" ON "ai_comment_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "ai_comment_jobs_user_id_status_updated_at_idx" ON "ai_comment_jobs"("user_id", "status", "updated_at");

-- AddForeignKey
ALTER TABLE "ai_comment_jobs" ADD CONSTRAINT "ai_comment_jobs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_comment_jobs" ADD CONSTRAINT "ai_comment_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
