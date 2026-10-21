import { randomUUID } from "node:crypto";
import { access, constants, mkdir, writeFile, rename, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import {
  STORAGE_KEY_RE,
  type StorageProvider,
  type StoragePutInput,
} from "./StorageProvider";

/**
 * StorageProvider em disco local.
 *
 * - Desenvolvimento: `.data/uploads` (padrão).
 * - Produção em contêiner (Coolify, docs/0011): `STORAGE_DIR` aponta para um
 *   volume persistente (ex.: `/data/uploads`), gravável pelo usuário não root
 *   da imagem. Sobrevive a restart e a recriação do contêiner porque o dado
 *   está no volume, não na camada da imagem.
 * - Não serve para serverless (Vercel): o disco lá é efêmero — por isso a
 *   produção atual continua com STORAGE_PROVIDER=supabase.
 *
 * Os arquivos ficam fora de `public` e são servidos pela rota /api/media,
 * que só aceita chaves no formato `carts/{id}/{uuid}.{jpg|png|webp}`
 * (STORAGE_KEY_RE) e confere que o caminho final continua dentro do diretório
 * base — nenhuma outra leitura de disco é possível por ali.
 */
export function createLocalDiskStorage(): StorageProvider {
  // turbopackIgnore (aqui e em cada operação de disco abaixo) evita que o
  // bundler trace o projeto inteiro por causa do caminho dinâmico — sem isso,
  // o build `standalone` copiava src/, docs/ etc. para a saída (o aviso
  // "Encountered unexpected file in NFT list" já existia antes desta mudança).
  const baseDir = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.STORAGE_DIR || ".data/uploads",
  );
  const publicBase = (process.env.STORAGE_PUBLIC_URL || "/api/media").replace(/\/+$/, "");

  const CONTENT_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  function safeFullPath(key: string): string {
    if (!STORAGE_KEY_RE.test(key)) throw new Error("Chave de storage inválida.");
    const full = path.resolve(/* turbopackIgnore: true */ baseDir, key);
    if (!full.startsWith(baseDir + path.sep)) throw new Error("Caminho inválido.");
    return full;
  }

  return {
    async put({ key, body }: StoragePutInput) {
      const full = safeFullPath(key);
      await mkdir(/* turbopackIgnore: true */ path.dirname(full), { recursive: true });
      // Escrita atômica: grava num temporário no MESMO diretório e renomeia.
      // Um processo interrompido no meio (deploy, OOM) nunca deixa uma foto
      // pela metade no caminho definitivo — no pior caso sobra um `.tmp-*`,
      // que a rota /api/media nunca serve (não casa com STORAGE_KEY_RE).
      const tmp = `${full}.tmp-${randomUUID()}`;
      try {
        await writeFile(/* turbopackIgnore: true */ tmp, body, { flag: "wx" });
        await rename(/* turbopackIgnore: true */ tmp, /* turbopackIgnore: true */ full);
      } catch (err) {
        await unlink(/* turbopackIgnore: true */ tmp).catch(() => {});
        throw err;
      }
      return { key, url: this.getPublicUrl(key) };
    },
    async delete(key: string) {
      try {
        await unlink(/* turbopackIgnore: true */ safeFullPath(key));
      } catch (err) {
        // Ausência do arquivo não é erro (idempotente).
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }
    },
    getPublicUrl(key: string) {
      return `${publicBase}/${key}`;
    },
    async read(key: string) {
      try {
        const full = safeFullPath(key);
        const body = await readFile(/* turbopackIgnore: true */ full);
        const contentType = CONTENT_TYPES[path.extname(full)] ?? "application/octet-stream";
        return { body, contentType };
      } catch {
        return null;
      }
    },
    async check() {
      // Usado pelo health check: o diretório precisa existir e ser gravável
      // pelo usuário do processo (volume montado com a permissão certa).
      await mkdir(/* turbopackIgnore: true */ baseDir, { recursive: true });
      await access(/* turbopackIgnore: true */ baseDir, constants.R_OK | constants.W_OK);
    },
  };
}
