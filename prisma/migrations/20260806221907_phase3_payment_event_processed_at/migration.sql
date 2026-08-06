-- AlterTable
ALTER TABLE "PaymentEvent" ADD COLUMN     "processedAt" TIMESTAMP(3);

-- Eventos anteriores a esta coluna foram registrados pelo código antigo, que
-- só gravava a linha depois de decidir aplicar (ou não) a transição. Marcá-los
-- como concluídos preserva a idempotência de sempre: sem isso eles ficariam
-- com processedAt nulo e um reenvio antigo seria reprocessado. Reprocessar
-- seria inofensivo (shouldApplyTransition barra a repetição), mas o
-- comportamento explícito é melhor que o acidental.
UPDATE "PaymentEvent" SET "processedAt" = "createdAt" WHERE "processedAt" IS NULL;
