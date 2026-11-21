# word-processor: help

You just want to write in a familiar word processor. This module gives your pane the everyday formatting kit: bold, italic, underline, lists, headings, indent, font size and family, and text colour.

## What it gives you

- **Bold** (toolbar; **Mod-B**), **Italic** (**Mod-I**) and **Underline** (**Mod-U**): toggle the style on the selection, or on what you type next if nothing is selected. The button looks pressed while the selection has it.
- **Bullet list** (toolbar; **Mod-Shift-8**) and **Numbered list** (toolbar; **Mod-Shift-9**): turn the paragraph into a list, or back again.
- **Heading level** (toolbar menu: **Paragraph**, **Heading 1**, **Heading 2**, **Heading 3**; palette: **Plain paragraph**, **Heading 1** to **3**; **Mod-Alt-0** for a plain paragraph, **Mod-Alt-1**, **-2**, **-3** for headings). The menu shows the level under the caret.
- **Font size** and **Font family** (toolbar menus; the family offers Default, Serif, Sans and Mono): change the selected text, or what you type next.
- **Text colour** (toolbar colour picker): colours the selection, or what you type next.
- **Tab** and **Shift-Tab** (palette: **Indent (nest list item)** and **Outdent (lift list item)**): in a list, nest an item or lift it; outside a list, indent or un-indent the paragraph one step.

Every control is also in the action palette (Cmd-/ or Ctrl-/). A control that can't run is greyed out, not hidden.

## Walkthrough

1. Turn the module on. The toolbar fills with the formatting controls; click into the text to enable them.
2. Select a word and press **Mod-B**, then click **Bold** to toggle it back. Selecting never gets lost by clicking a control.
3. Put the caret in a line and choose **Heading 2** from the heading menu, then press **Mod-Alt-0** to make it plain again.
4. Press **Mod-Shift-8** for a bullet list. Type a few items, press **Tab** to nest the second one, and **Shift-Tab** to lift it. Tab on the first item does nothing.
5. Select some text and change the **Font size**, **Font family** and **Text colour**. Move the caret elsewhere and watch the controls show the values there.
6. Choose a colour with nothing selected and type: the new text uses it.
7. Press **Cmd-Z**: each change undoes as one step, and dragging in the colour picker counts as one.

## How the pieces fit

The toolbar, the palette and the keys all do the same things, so use whichever is nearest. The formatting is stored in the document itself, so the text looks the same with the module off; turning it off removes only the toolbar and shortcuts. With several panes on one document, the toolbar follows the one you last clicked in, and undo is per pane.

## Tips

- **Tab** never moves focus out of the editor. Outside a list, **Shift-Tab** at no indent does nothing.
- If the document has no list type (or heading type), those controls are disabled rather than broken.
- If another module offers the same shortcut, the first one placed wins.
