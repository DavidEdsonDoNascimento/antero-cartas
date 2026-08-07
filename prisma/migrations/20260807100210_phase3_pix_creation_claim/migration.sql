-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pixClaimedAt" TIMESTAMP(3),
ADD COLUMN     "pixQrCode" TEXT,
ADD COLUMN     "pixQrCodeBase64" TEXT,
ADD COLUMN     "pixExpiresAt" TIMESTAMP(3);
