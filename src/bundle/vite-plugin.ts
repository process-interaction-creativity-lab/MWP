// Serves bundled modules to the web host: built on request in dev (and
// announced on change), emitted as files in a build. The host fetches
// `modules/index.json`, then `modules/<id>.js` for each id; devtools fetches
// `modules/<id>.js.map` beside it, and a module fetches its data files from
// `modules/<id>/<name>-<hash>.<ext>`.

import path from 'node:path';
import type { Plugin } from 'vite';
import { MODULE_CHANGED } from './events.ts';
import { bundleModule, findModules } from './modules.ts';

// `only`: just these modules (a preset's), else every module in `roots`.
export function mwpsModules(roots: readonly string[], only: readonly string[] | null = null): Plugin {
  const absRoots = roots.map((r) => path.resolve(r));
  const find = () => findModules(roots).filter((m) => !only || only.includes(m.id));
  return {
    name: 'mwps-modules',

    configureServer(server) {
      server.watcher.add(absRoots);
      const onChange = (file: string) => {
        const root = absRoots.find((r) => file.startsWith(r + path.sep));
        if (!root) return;
        const id = path.relative(root, file).split(path.sep)[0];
        server.ws.send({ type: 'custom', event: MODULE_CHANGED, data: { id } });
      };
      server.watcher.on('change', onChange);
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url === '/modules/index.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(find().map((m) => m.id)));
          return;
        }
        const data = /^\/modules\/([\w-]+)\/([^/]+)$/.exec(url);
        const match = /^\/modules\/([\w-]+)\.js(\.map)?$/.exec(url);
        const hit = match ?? data;
        const source = hit && find().find((m) => m.id === hit[1]);
        if (!hit || !source) return next();
        try {
          const { code, map, files } = await bundleModule(source);
          if (data) {
            const file = files.get(decodeURIComponent(data[2]));
            if (!file) return next();
            res.setHeader('Content-Type', mime(data[2]));
            res.end(file);
            return;
          }
          res.setHeader('Content-Type', hit[2] ? 'application/json' : 'text/javascript');
          res.end(hit[2] ? map : code);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end(String(err instanceof Error ? err.message : err));
        }
      });
    },

    async generateBundle() {
      const sources = find();
      for (const source of sources) {
        const { code, map, files } = await bundleModule(source);
        for (const [name, bytes] of files) {
          this.emitFile({ type: 'asset', fileName: `modules/${source.id}/${name}`, source: bytes });
        }
        this.emitFile({ type: 'asset', fileName: `modules/${source.id}.js`, source: code });
        this.emitFile({ type: 'asset', fileName: `modules/${source.id}.js.map`, source: map });
      }
      this.emitFile({
        type: 'asset',
        fileName: 'modules/index.json',
        source: JSON.stringify(sources.map((m) => m.id)),
      });
    },
  };
}

const MIME: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gz': 'application/gzip',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
};

function mime(name: string): string {
  return MIME[path.extname(name)] ?? 'application/octet-stream';
}
