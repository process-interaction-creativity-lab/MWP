import { authorOf, documentPlugin, historyKind, ui, useStore, valueKey } from 'mwps';
import type { ModuleContext } from 'mwps';
import { commitLog, reader } from 'mwps/changes';
import type { CommitLog } from 'mwps/changes';
import { Button, Input } from 'mwps/ui';
import { ordinaryBlocks, textOf } from 'mwps/text';
import type { Node } from 'prosemirror-model';
import { PluginKey } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import { connectPrinter, disconnectPrinter, printBanner } from './phomemo';
import type { PrinterConnection } from './phomemo';
import { findDeletedWords } from './word-diff';

const MIN_SIZE = 1;
const MAX_SIZE = 200;
const MAX_PRINTED = 40;

const batchKey = valueKey<string[]>('batch', { default: [], persist: true });
const totalKey = valueKey('total', { default: 0, persist: true });
const sizeKey = valueKey('size', { default: 5, persist: true });
// Not persisted: after a reload the writer reconnects by hand.
const printerKey = valueKey<PrinterConnection | null>('printer', { default: null });
const connectingKey = valueKey('connecting', { default: false });
const printingKey = valueKey('printing', { default: false });
const noticeKey = valueKey<string | null>('notice', { default: null });

/** The text of ordinary blocks, one block per line, so a paragraph break is a boundary. */
function flatText(doc: Node): string {
  return ordinaryBlocks(doc).map((b) => textOf(b.node, b.pos).text).join('\n');
}

const deletes = (tr: Transaction) =>
  tr.mapping.maps.some((m) => {
    let found = false;
    m.forEach((from, to) => {
      if (to > from) found = true;
    });
    return found;
  });

/** The whole words the writer's own edit removed, or null. */
function deletedWords(tr: Transaction): string[] | null {
  if (!tr.docChanged || authorOf(tr) !== 'user' || historyKind(tr) || !deletes(tr)) return null;
  const words = findDeletedWords(flatText(tr.before), flatText(tr.doc));
  return words.length ? words : null;
}

/** `k` distinct words chosen at random (partial Fisher-Yates). */
function sample(words: readonly string[], k: number): string[] {
  const pool = [...new Set(words)];
  for (let i = 0; i < Math.min(k, pool.length); i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k);
}

function stickerLines(words: readonly string[], size: number, total: number): string[] {
  const shown = words.length > MAX_PRINTED ? sample(words, MAX_PRINTED) : words;
  return ['DELETED WORDS', ...shown, '-', `Batch: ${size} / Total deleted: ${total}`];
}

const reason = (e: unknown, what: string) => {
  if (e instanceof DOMException && e.name === 'NotFoundError') return `${what}: no printer was chosen.`;
  return `${what}: ${e instanceof Error && e.message ? e.message : 'unknown error'}`;
};

const deletions = new PluginKey<CommitLog<string[]>>('deleted-words-printer');

export function setup(ctx: ModuleContext) {
  const batch = ctx.getValue(batchKey);
  const total = ctx.getValue(totalKey);
  const size = ctx.getValue(sizeKey);
  const printer = ctx.getValue(printerKey);
  const connecting = ctx.getValue(connectingKey);
  const printing = ctx.getValue(printingKey);
  const notice = ctx.getValue(noticeKey);

  const drop = () => {
    const c = printer.get();
    if (c) disconnectPrinter(c);
    printer.set(null);
  };

  // One sticker for the batch as it is now; only those words leave it.
  async function print(c: PrinterConnection) {
    const sent = batch.get().slice();
    printing.set(true);
    notice.set(null);
    try {
      await printBanner(c, stickerLines(sent, size.get(), total.get()));
      if (ctx.signal.aborted) return;
      batch.set((b) => b.slice(sent.length));
    } catch (e) {
      if (!ctx.signal.aborted) notice.set(reason(e, 'Printing failed'));
    } finally {
      printing.set(false);
    }
  }

  function tick() {
    const c = printer.get();
    if (c && !printing.get() && batch.get().length >= size.get()) void print(c);
  }

  async function connect() {
    if (printer.get() || connecting.get()) return;
    connecting.set(true);
    notice.set(null);
    try {
      const c = await connectPrinter();
      if (ctx.signal.aborted) return disconnectPrinter(c);
      c.device.addEventListener('gattserverdisconnected', () => {
        if (printer.get() === c) printer.set(null);
      });
      printer.set(c);
      tick();
    } catch (e) {
      if (!ctx.signal.aborted) notice.set(reason(e, 'Could not connect'));
    } finally {
      connecting.set(false);
    }
  }

  ctx.effect(() => drop);

  ctx.each(ctx.documents, (d) => {
    d.provide(
      documentPlugin({
        key: deletions,
        state: commitLog(deletedWords),
        view: (v) => {
          const read = reader((s) => deletions.getState(s)!, v.state);
          return {
            update: (v) => {
              const fresh = read(v.state).flat();
              if (!fresh.length) return;
              batch.set((b) => [...b, ...fresh]);
              total.set((t) => t + fresh.length);
              tick();
            },
          };
        },
      }),
    );
  });

  const Controls = () => {
    const connected = useStore(printer) !== null;
    const isConnecting = useStore(connecting);
    const isPrinting = useStore(printing);
    const count = useStore(batch, (b) => b.length);
    const n = useStore(size);
    const sum = useStore(total);
    const message = useStore(notice);
    return (
      <div className="deleted-words-printer-controls">
        <Button
          size="sm"
          variant="outline"
          disabled={isConnecting || isPrinting}
          onClick={() => (connected ? drop() : void connect())}
        >
          {isConnecting ? 'Connecting' : connected ? 'Disconnect printer' : 'Connect printer'}
        </Button>
        <label>
          Words per sticker
          <Input
            type="text"
            inputMode="numeric"
            aria-label="Words per sticker"
            value={n}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
              if (!Number.isNaN(v)) size.set(Math.min(MAX_SIZE, Math.max(MIN_SIZE, v)));
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
        <span className="deleted-words-printer-count" title="Words waiting / lifetime total">
          {count}/{n} waiting, {sum} deleted
        </span>
        {message && (
          <span className="deleted-words-printer-notice" role="status">
            {message}
          </span>
        )}
      </div>
    );
  };
  ctx.provide(ui.toolbar(Controls));
}

export const styles = `
.deleted-words-printer-controls { display: flex; align-items: center; gap: 8px; }
.deleted-words-printer-controls label { display: flex; align-items: center; gap: 4px; }
.deleted-words-printer-controls input { width: 4.5em; }
.deleted-words-printer-notice { color: var(--destructive); }
`;
