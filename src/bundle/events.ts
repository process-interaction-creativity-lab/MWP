// Shared by the bundler (node) and the page, which also bundles a module
// made in the module creator: keep this file import-free.
export const MODULE_CHANGED = 'mwps:module-changed';
// The page-wide function each module bundle calls with its factory.
export const DEFINE = '__mwpsDefine';

// The packages a module's bundle leaves out: the page supplies its own
// copy (web/shared-packages.ts), so it has one React and one ProseMirror.
export const SHARED = [
  'mwps',
  'mwps/ui',
  'mwps/icons',
  'mwps/text',
  'mwps/changes',
  'mwps/ai',
  'mwps/react',
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'prosemirror-commands',
  'prosemirror-dropcursor',
  'prosemirror-gapcursor',
  'prosemirror-history',
  'prosemirror-keymap',
  'prosemirror-model',
  'prosemirror-schema-list',
  'prosemirror-state',
  'prosemirror-transform',
  'prosemirror-utils',
  'prosemirror-view',
] as const;

// A bundle is one CommonJS factory, handed to the page through DEFINE with
// the module's summary and help: esbuild's banner and footer around it.
export const defineBanner = (id: string): string => `${DEFINE}(${JSON.stringify(id)}, function (module, exports, require) {`;
export const defineFooter = (meta: { summary: string | null; help: string | null }): string => `}, ${JSON.stringify(meta)});`;
