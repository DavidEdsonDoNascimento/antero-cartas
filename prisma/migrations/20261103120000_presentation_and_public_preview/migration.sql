-- Antero Cartas 2.0: estilos de apresentação e prévia pública /presente/.
--
-- Aditiva e retrocompatível de propósito:
-- - quatro colunas NULÁVEIS e SEM default: nenhuma linha existente é reescrita;
--   toda carta já publicada continua com presentation NULL (renderizador
--   legado) e sharePreviewVersion NULL (prévia genérica, sem foto nem trecho);
-- - o índice único de publicId aceita vários NULL (PostgreSQL), então as cartas
--   antigas não precisam de preenchimento: ganham o identificador sob demanda;
-- - a imagem anterior a esta migration continua funcionando: o Prisma lista as
--   colunas explicitamente e simplesmente não lê estas.

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "presentation" TEXT,
ADD COLUMN     "presentationOptions" JSONB,
ADD COLUMN     "publicId" TEXT,
ADD COLUMN     "sharePreviewVersion" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Cart_publicId_key" ON "Cart"("publicId");
