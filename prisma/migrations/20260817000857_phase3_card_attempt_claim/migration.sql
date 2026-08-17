-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cardClaimedAt" TIMESTAMP(3),
ADD COLUMN     "cardIdempotencyKey" TEXT,
ADD COLUMN     "cardTokenFingerprint" TEXT;
