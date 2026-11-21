// React widgets, imported by modules as `mwps/react`.

import type { ComponentType } from 'react';
import type { Decoration } from 'prosemirror-view';

/** A widget decoration whose body is a React component, drawn as the
 *  module's other components are: in its CSS scope, and a throw turns the
 *  module off. Return it from `decorations` like any widget:
 *    reactWidget(pos, () => <Balloon id={id} />, { key: id })
 *  The component is drawn once per `key` and kept while a widget with that
 *  key stays, so it reads what changes from values or `p.state` with
 *  `useStore`, not from the closure. The widget sits in the line of text:
 *  draw inline content, or take it out of the flow with
 *  `position: absolute`. Events inside it are its own, not the editor's
 *  (Cmd-Z in its text box isn't the writer's undo), unless `spec` gives a
 *  `stopEvent` of its own. The rest of `spec` is ProseMirror's widget spec
 *  (`side`, `marks`, …). */
export function reactWidget(
  pos: number,
  component: ComponentType,
  spec: { key: string; side?: number; [other: string]: unknown },
): Decoration;
