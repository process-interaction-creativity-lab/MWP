// `mwps/react` for one module: widget decorations with a React body, each in
// a root of its own under the module's ModuleRoot. ProseMirror keeps a
// widget's element while its key stays, and calls `destroy` when it drops it.

import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { Decoration } from 'prosemirror-view';
import { ModuleRoot } from './module-ui.js';

export function reactFor(moduleId: string) {
  return {
    reactWidget(pos: number, Component: ComponentType, spec: { key: string; [other: string]: unknown }): Decoration {
      const roots = new WeakMap<Node, ReturnType<typeof createRoot>>();
      return Decoration.widget(
        pos,
        () => {
          const el = document.createElement('span');
          el.className = 'mwps-widget';
          const root = createRoot(el);
          root.render(
            <ModuleRoot moduleId={moduleId} as="span">
              <Component />
            </ModuleRoot>,
          );
          roots.set(el, root);
          return el;
        },
        {
          stopEvent: () => true,
          ...spec,
          destroy(el: Node) {
            const root = roots.get(el);
            // Not during a React render (a component's dispatch can redraw).
            if (root) queueMicrotask(() => root.unmount());
            (spec.destroy as ((el: Node) => void) | undefined)?.(el);
          },
        },
      );
    },
  };
}
