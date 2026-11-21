// Which module a piece of UI belongs to. The host sets it around each
// module component; the kit's portaled parts (dialogs, popovers, selects,
// tooltips) read it, so content portaled to `body` stays in the module's
// CSS scope and gets the `mwps-module-ui` defaults.

import { createContext, useContext, type ReactNode } from 'react';

export const ModuleScope = createContext<string | null>(null);

// The attribute module CSS is scoped to: space-separated module ids.
export const SCOPE_ATTR = 'data-mwps-scope';

export function InModuleScope({ children }: { children: ReactNode }) {
  const id = useContext(ModuleScope);
  if (id === null) return children;
  return (
    <div className="mwps-module-ui" {...{ [SCOPE_ATTR]: id }} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}

// Puts the caret back in the pane a module component belongs to (the last
// focused pane, for a component on the module scope). The host sets it
// beside `ModuleScope`.
export const FocusBack = createContext<(() => void) | null>(null);

// The default `onCloseAutoFocus` of the kit's dialogs, popovers and selects:
// when one closes and focus has nowhere to go, the caret returns to the
// pane. Focus the writer moved elsewhere (a click into a text box or another
// pane) stays there, and a dialog still open keeps its own focus handling.
// `undefined` outside a module, which leaves Radix's default.
export function useFocusBack(): ((e: Event) => void) | undefined {
  const back = useContext(FocusBack);
  if (!back) return undefined;
  return (e) => {
    if (document.querySelector('[role="dialog"][data-state="open"]')) return;
    e.preventDefault();
    if (!document.activeElement || document.activeElement === document.body) back();
  };
}
