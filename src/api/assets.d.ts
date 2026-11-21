// Data files a module imports. Each import is the file's URL, relative to the
// page: `fetch(url)` it when needed. The file is served from the module's
// own folder (`modules/<id>/<name>-<hash>.<ext>`). The list is
// DATA_EXTENSIONS in src/bundle/modules.ts. No imports or exports here:
// that keeps this an ambient file.

declare module '*.txt' { const url: string; export default url; }
declare module '*.tsv' { const url: string; export default url; }
declare module '*.csv' { const url: string; export default url; }
declare module '*.bin' { const url: string; export default url; }
declare module '*.gz' { const url: string; export default url; }
declare module '*.wasm' { const url: string; export default url; }
declare module '*.png' { const url: string; export default url; }
declare module '*.jpg' { const url: string; export default url; }
declare module '*.webp' { const url: string; export default url; }
declare module '*.svg' { const url: string; export default url; }
declare module '*.mp3' { const url: string; export default url; }
declare module '*.glb' { const url: string; export default url; }
