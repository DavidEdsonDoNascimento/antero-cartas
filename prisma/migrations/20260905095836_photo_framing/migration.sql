-- Ajuste de enquadramento das fotos (ponto focal + zoom).
--
-- Aditiva e retrocompatível de propósito: três colunas NULÁVEIS e SEM default,
-- então nenhuma linha existente é reescrita e nenhuma foto antiga ganha valor.
-- NULL significa "sem ajuste" e a renderização cai no recorte centralizado de
-- sempre (ver src/lib/photoFraming.ts). O código anterior a esta migration
-- continua funcionando: ele simplesmente não lê estas colunas.

-- AlterTable
ALTER TABLE "CartMedia" ADD COLUMN     "focalX" DOUBLE PRECISION,
ADD COLUMN     "focalY" DOUBLE PRECISION,
ADD COLUMN     "zoom" DOUBLE PRECISION;
