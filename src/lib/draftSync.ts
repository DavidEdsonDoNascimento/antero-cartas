/**
 * Sincronização do rascunho com o servidor. Sem React e sem navegador, para
 * ser testável em Node e para sobreviver à troca de telas do editor.
 *
 * O que garante:
 * - Um salvamento de cada vez. O que muda durante um envio espera e vira UM
 *   envio só, com o texto mais recente (o PATCH leva a carta inteira, então é
 *   seguro pular as versões intermediárias).
 * - Toda alteração vai para o registro local (`journal`) ANTES de qualquer
 *   tentativa de rede, e só sai de lá quando o servidor confirma aquela versão.
 *   É o que protege o texto quando a aba fecha: `pagehide`/`keepalive` são só
 *   uma tentativa a mais, porque o navegador não garante que terminem.
 * - Cada envio informa a versão em que se baseia (`clientUpdatedAt`). Um envio
 *   atrasado, abortado pelo prazo mas ainda vivo no servidor, é recusado com
 *   409 em vez de sobrescrever um texto mais novo.
 * - Nova tentativa só para falha transitória. Como o envio é idempotente, um
 *   reenvio cuja primeira tentativa chegou ao servidor é reconhecido pelo 409 +
 *   leitura da carta, sem gravar de novo.
 */

import { ApiClientError, type CartPatch } from "@/lib/api";

export interface SaveState {
  status: "idle" | "saving" | "saved" | "error";
  /** Em "saving": a tentativa anterior falhou e outra está programada. */
  retrying: boolean;
  /** Em "error": a mensagem para quem está escrevendo. */
  errorMessage: string | null;
  /** O texto não confirmado está guardado neste aparelho? */
  savedLocally: boolean;
}

export type FlushResult = { ok: true } | { ok: false; message: string };

export interface ServerDraft {
  patch: CartPatch;
  updatedAt: string;
  editable: boolean;
}

export interface DraftSyncOptions {
  initial: CartPatch;
  baseUpdatedAt: string;
  save: (
    patch: CartPatch,
    baseUpdatedAt: string,
    options: { keepalive: boolean },
  ) => Promise<{ updatedAt: string }>;
  /** Lê a versão do servidor, para resolver um conflito de versão. */
  load: () => Promise<ServerDraft>;
  /** Devolve `false` se não conseguiu guardar (cota cheia, modo privado). */
  journalSave: (patch: CartPatch) => boolean;
  journalClear: (patch: CartPatch) => void;
  debounceMs?: number;
  retryDelaysMs?: number[];
  slowRetryMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 700;
const DEFAULT_RETRY_DELAYS_MS = [1000, 3000, 8000];
/** Depois de esgotar as tentativas rápidas: tenta sem pressa até voltar. */
const DEFAULT_SLOW_RETRY_MS = 30_000;
/** Conflitos seguidos só acontecem com outra aba escrevendo sem parar. */
const MAX_CONFLICTS_IN_A_ROW = 3;

const CONNECTION_MESSAGE = "Pode ser a sua conexão ou uma instabilidade nossa.";
const UNEXPECTED_MESSAGE = "Tente novamente em instantes.";

/** Serialização estável: a ordem das chaves e os `undefined` não contam. */
export function canonicalPatch(patch: CartPatch): string {
  const sorted = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, sorted(v)]),
      );
    }
    return value;
  };
  return JSON.stringify(sorted(patch));
}

/**
 * Falha de rede, prazo esgotado, resposta ilegível, 408, 425, 429 e 5xx passam
 * sozinhas. Dado recusado, token inválido ou carta que não aceita mais edição
 * não mudam com outra tentativa.
 */
export function isTransientSaveError(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) return true;
  if (err.code === "invalid_response") return true;
  return err.status === 408 || err.status === 425 || err.status === 429 || err.status >= 500;
}

function definitiveMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.status === 401 || err.status === 404) {
      return "Não encontramos esta cartinha neste navegador.";
    }
    if (err.code === "forbidden_state") return "Esta cartinha não pode mais ser editada.";
    // Cobrança aberta e a alteração deixaria a carta sem mensagem: o servidor explica.
    if (err.code === "pending_payment_incomplete") return err.message;
    if (err.status === 400) return "Algum dado da cartinha não foi aceito.";
  }
  return UNEXPECTED_MESSAGE;
}

function isVersionConflict(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === "conflict";
}

export class DraftSync {
  private readonly options: DraftSyncOptions;
  private readonly retryDelays: number[];
  private desired: CartPatch;
  private desiredKey: string;
  private confirmedKey: string;
  private baseUpdatedAt: string;
  private sending = false;
  private keepaliveNext = false;
  private closed = false;
  private attempts = 0;
  private conflicts = 0;
  private everSaved = false;
  private savedLocally = true;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private state: SaveState = {
    status: "idle",
    retrying: false,
    errorMessage: null,
    savedLocally: true,
  };
  private listeners = new Set<(state: SaveState) => void>();
  private waiters: Array<(result: FlushResult) => void> = [];

  constructor(options: DraftSyncOptions) {
    this.options = options;
    this.retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.desired = options.initial;
    this.desiredKey = canonicalPatch(options.initial);
    this.confirmedKey = this.desiredKey;
    this.baseUpdatedAt = options.baseUpdatedAt;
  }

  getState(): SaveState {
    return this.state;
  }

  subscribe(listener: (state: SaveState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Registra o estado atual da carta. Devolve `true` se há algo a salvar. */
  setDesired(patch: CartPatch): boolean {
    const key = canonicalPatch(patch);
    const dirty = key !== this.confirmedKey;
    if (key === this.desiredKey) return dirty;

    this.desired = patch;
    this.desiredKey = key;
    this.attempts = 0;
    this.conflicts = 0;
    this.clearTimers();

    if (!dirty) {
      // O registro guardava o texto desfeito: ele não pode voltar na retomada.
      this.savedLocally = this.options.journalSave(patch);
      // Um envio em andamento pode gravar a versão descartada. `pump` reenvia, e
      // o registro só sai quando o servidor confirmar a correção.
      if (!this.sending) {
        this.options.journalClear(patch);
        this.settleClean();
      }
      return false;
    }

    this.savedLocally = this.options.journalSave(patch);
    this.setState({ status: "saving", retrying: false, errorMessage: null });
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.pump();
    }, this.options.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    return true;
  }

  /** Envia já o que está pendente, sem esperar o debounce. Não aguarda o fim. */
  flushNow({ keepalive = false }: { keepalive?: boolean } = {}): void {
    if (this.desiredKey === this.confirmedKey) return;
    this.clearTimers();
    this.keepaliveNext = keepalive;
    void this.pump();
  }

  /**
   * Envia o que está pendente e aguarda a confirmação do servidor. Quem avança
   * ao pagamento depende desta resposta: `ok` só vem com tudo confirmado.
   */
  flush(): Promise<FlushResult> {
    if (this.desiredKey === this.confirmedKey && !this.sending && !this.debounceTimer) {
      return Promise.resolve({ ok: true });
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.restart();
    });
  }

  /** "Tentar de novo", conexão de volta ou aba visível de novo. */
  retryNow(): void {
    if (this.state.status !== "error" && !this.state.retrying) return;
    this.restart();
  }

  /** A tela saiu: tenta enviar o que falta, sem insistir depois disso. */
  close(): void {
    this.closed = true;
    this.flushNow({ keepalive: true });
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    // Quem esperava para seguir adiante já saiu desta tela: não navega mais.
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve({ ok: false, message: UNEXPECTED_MESSAGE }));
  }

  /** Reabre depois de `close` (React remonta os efeitos no Strict Mode). */
  open(): void {
    this.closed = false;
  }

  private restart(): void {
    this.attempts = 0;
    this.conflicts = 0;
    this.clearTimers();
    if (this.state.status === "error" || this.state.retrying) {
      this.setState({ status: "saving", retrying: false, errorMessage: null });
    }
    void this.pump();
  }

  private clearTimers(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.debounceTimer = null;
    this.retryTimer = null;
  }

  private setState(next: Pick<SaveState, "status" | "retrying" | "errorMessage">): void {
    const state = { ...next, savedLocally: this.savedLocally };
    const unchanged = (Object.keys(state) as Array<keyof SaveState>).every(
      (k) => state[k] === this.state[k],
    );
    if (unchanged) return;
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }

  private async pump(): Promise<void> {
    while (!this.sending && !this.debounceTimer && this.desiredKey !== this.confirmedKey) {
      this.sending = true;
      const sent = this.desired;
      const sentKey = this.desiredKey;
      const keepalive = this.keepaliveNext;
      this.keepaliveNext = false;
      let proceed: boolean;
      try {
        const { updatedAt } = await this.options.save(sent, this.baseUpdatedAt, { keepalive });
        this.confirm(sent, sentKey, updatedAt);
        proceed = true;
      } catch (err) {
        proceed = await this.handleFailure(err, sent, sentKey);
      } finally {
        this.sending = false;
      }
      if (!proceed) return;
    }
    if (!this.sending && !this.debounceTimer && this.desiredKey === this.confirmedKey) {
      this.settleClean();
    }
  }

  private confirm(sent: CartPatch, sentKey: string, updatedAt: string): void {
    this.baseUpdatedAt = updatedAt;
    this.confirmedKey = sentKey;
    this.attempts = 0;
    this.conflicts = 0;
    this.everSaved = true;
    // Só apaga do registro se ele ainda guarda esta versão (ver storage.ts).
    this.options.journalClear(sent);
  }

  /** Devolve `true` se o laço de envio deve continuar agora. */
  private async handleFailure(err: unknown, sent: CartPatch, sentKey: string): Promise<boolean> {
    if (isVersionConflict(err)) return this.resolveConflict(sent, sentKey);
    if (isTransientSaveError(err)) return this.scheduleRetry();
    this.fail(definitiveMessage(err));
    return false;
  }

  /**
   * A versão do servidor mudou desde a base deste envio. Ou uma tentativa
   * anterior chegou lá apesar do erro (nada a regravar), ou outra aba escreveu.
   * Nesse caso vale o que está na tela de quem está digitando agora.
   */
  private async resolveConflict(sent: CartPatch, sentKey: string): Promise<boolean> {
    if (this.closed) return false;
    this.conflicts += 1;
    if (this.conflicts > MAX_CONFLICTS_IN_A_ROW) {
      this.fail("Esta cartinha está sendo alterada em outra aba.");
      return false;
    }
    let server: ServerDraft;
    try {
      server = await this.options.load();
    } catch (err) {
      if (isTransientSaveError(err)) return this.scheduleRetry();
      this.fail(definitiveMessage(err));
      return false;
    }
    // A tela saiu durante a leitura. Outra pode já ter texto mais novo, e reenviar
    // com a versão recém-lida passaria por cima dele. O registro local continua.
    if (this.closed) return false;
    if (!server.editable) {
      this.fail("Esta cartinha não pode mais ser editada.");
      return false;
    }
    if (canonicalPatch(server.patch) === sentKey) {
      this.confirm(sent, sentKey, server.updatedAt);
    } else {
      this.baseUpdatedAt = server.updatedAt;
    }
    return true;
  }

  private scheduleRetry(): boolean {
    if (this.closed) return false;
    const delay = this.retryDelays[this.attempts];
    this.attempts += 1;
    if (delay !== undefined) {
      this.setState({ status: "saving", retrying: true, errorMessage: null });
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.pump();
      }, delay);
      return false;
    }
    this.fail(CONNECTION_MESSAGE);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.pump();
    }, this.options.slowRetryMs ?? DEFAULT_SLOW_RETRY_MS);
    return false;
  }

  private fail(message: string): void {
    this.setState({ status: "error", retrying: false, errorMessage: message });
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve({ ok: false, message }));
  }

  private settleClean(): void {
    this.setState({
      status: this.everSaved ? "saved" : "idle",
      retrying: false,
      errorMessage: null,
    });
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve({ ok: true }));
  }
}
