// What `mwps` is at run time: the host hands this object to every module
// bundle. Its types are src/api/mwps.d.ts.

export { valueKey } from './scope.js';
export { nonEmpty } from './store.js';
export { authorOf, documentPlugin, historyKind, originOf } from './wrap-plugin.js';
export { ui, useAction, useStore } from './ui.js';
