// The packages every module's bundle may require, by name: the host's own
// copies, so every module uses the page's one React and ProseMirror. Used by
// the page's loader and by `npm run check`, which installs a module headlessly.
// `mwps/react` is each module's own (load-modules.ts).

import * as pmCommands from 'prosemirror-commands';
import * as pmDropcursor from 'prosemirror-dropcursor';
import * as pmGapcursor from 'prosemirror-gapcursor';
import * as pmHistory from 'prosemirror-history';
import * as pmKeymap from 'prosemirror-keymap';
import * as pmModel from 'prosemirror-model';
import * as pmSchemaList from 'prosemirror-schema-list';
import * as pmState from 'prosemirror-state';
import * as pmTransform from 'prosemirror-transform';
import * as pmUtils from 'prosemirror-utils';
import * as pmView from 'prosemirror-view';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import type { SHARED } from '../bundle/events.js';
import * as runtime from '../core/runtime.js';
import * as ai from '../lib/ai.js';
import * as changes from '../lib/changes.js';
import * as text from '../lib/text.js';
import * as icons from '../ui/icons.js';
import * as kit from '../ui/index.js';

const shared: Record<Exclude<(typeof SHARED)[number], 'mwps/react'>, unknown> = {
  mwps: runtime,
  'mwps/ui': kit,
  'mwps/icons': icons,
  'mwps/text': text,
  'mwps/changes': changes,
  'mwps/ai': ai,
  react: React,
  'react/jsx-runtime': jsxRuntime,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  'prosemirror-commands': pmCommands,
  'prosemirror-dropcursor': pmDropcursor,
  'prosemirror-gapcursor': pmGapcursor,
  'prosemirror-history': pmHistory,
  'prosemirror-keymap': pmKeymap,
  'prosemirror-model': pmModel,
  'prosemirror-schema-list': pmSchemaList,
  'prosemirror-state': pmState,
  'prosemirror-transform': pmTransform,
  'prosemirror-utils': pmUtils,
  'prosemirror-view': pmView,
};

export function requireShared(id: string): unknown {
  if (!(id in shared)) throw new Error(`a module required "${id}", which the host doesn't supply`);
  return shared[id as keyof typeof shared];
}

