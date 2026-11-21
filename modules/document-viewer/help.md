# document-viewer: help

You want to read a document, or keep a finished piece open beside the one you are drafting, without any risk of changing it by accident. document-viewer locks one pane so it only reads.

## What it gives you

- **A read-only pane** (the pane it is turned on for): typing, deleting, cut, paste, drag and drop, formatting keys, toolbar buttons and palette actions all do nothing there, and actions that would edit are greyed out.
- **Reading as usual** (the text itself): you can still click to place the caret, select text, copy it and scroll. The document looks exactly as it did, with its formatting and other modules' decorations.
- **A lock on this pane only**: the same document in another pane stays editable.

## Walkthrough

1. Open a document with a few paragraphs and some bold text.
2. Turn on document-viewer for the pane showing it, from that pane's tab menu. Nothing looks different; that is the point.
3. Try to type, then select a word and press **Cmd-B** (or **Ctrl-B**). Nothing changes. Open the action palette (Cmd-/ or Ctrl-/) and notice that Bold is greyed out.
4. Select some text and copy it. Copying and scrolling work normally.
5. Open a second pane on the same document, without document-viewer. Edit there: the change shows up in the viewer pane at once.
6. Press **Cmd-Z** in the editable pane to undo; that works as usual. The viewer pane has nothing of its own to undo.
7. Turn document-viewer off. The pane is editable again, with your caret and scroll position where they were.

## How the pieces fit

The lock belongs to the pane, not to the document. That makes it handy for a reading copy next to a working copy: you edit in one pane and watch the result in the other. Nothing is saved or remembered; turning the module off simply unlocks the pane.

## Tips

- Edits other modules would make for you in the locked pane (dictation, for example) are refused too.
- Placing it twice on the same pane is harmless.
- If you want to edit, use another pane on the same document or turn the module off.
