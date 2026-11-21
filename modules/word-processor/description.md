# word-processor: description

The everyday formatting kit: bold, italic, underline, bullet and numbered lists, headings, indent, font size and family, and text colour, from a toolbar and the usual keyboard shortcuts. It behaves the way other word processors do.

Anchor fixture: the end-to-end journeys place this module, so its control and action names ("Bold", "Italic", ...) change only together with those journeys.

For anyone who just wants to write in a familiar word processor, and the baseline other modules are compared with.

**Kind:** extension. It adds a toolbar, actions and keys to an ordinary editing pane and brings no document types of its own.

Requirements:

- **Toolbar.** Controls for bold, italic, underline, numbered list, bullet list, heading level (paragraph and three heading levels), font size, font family (default, serif, sans, mono) and text colour. They act on the pane that last had focus and show the state at its selection: bold and the list buttons look pressed when the selection is bold or in that list, and the heading, size, family and colour controls show the current values (a plain default where there are none). Clicking a control never takes focus from the text or loses the selection.
- **Selection and caret.** Controls work on a selection; with a collapsed caret they shape what is typed next.
- **Shortcuts and palette.** Mod-B, Mod-I, Mod-U for the marks; Mod-Shift-8 for a bullet list and Mod-Shift-9 for a numbered list; Mod-Alt-1, -2, -3 for heading levels; Mod-Alt-0 for a plain paragraph. Each has a named action in the command palette, greyed out when it can't run, not hidden. Toolbar, palette and keys do the same thing.
- **Tab and Shift-Tab.** In a list, Tab nests the item and Shift-Tab lifts it; Tab on an item that can't nest (the first of its list) does nothing. Outside a list, Tab indents the current block one step and Shift-Tab takes one back, up to a sensible maximum; Shift-Tab at no indent does nothing. Tab never moves focus out of the editor. They also appear as palette actions.
- **Undo.** Every formatting change is one undo step in its pane, undone and redone like typing. Dragging in the colour picker is one step, not hundreds.
- **Several panes** on one document: the toolbar follows the last focused pane, and undo is per pane.
- **Missing types.** If the document has no type for a control (no list type, say), that control is disabled, not broken.
- **Stored in the document,** so the text looks the same with the module on or off. Turning it off removes only the toolbar and shortcuts.
- **Shared keys.** If another module offers the same shortcut, the first placed wins without errors.
