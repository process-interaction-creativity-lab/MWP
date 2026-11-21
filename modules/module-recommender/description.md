# module-recommender: description

Keeps quiet notes on how you edit, such as how much you delete and how long you work. Press a button and it reads your document and those notes, then suggests a few modules you might want, with the evidence behind each and a brief you can copy. Needs AI.

**Kind:** extension. It adds a toolbar button and a quiet recorder to ordinary panes.

For a writer who has a modular word processor but doesn't know which modules to ask for. The premise: a finished text hides how it was written. A poem typed straight through and one rewritten eleven times look the same; only the editing shows the difference. So the suggestions rest on two things, the document's text and a plain-language summary of the writer's habits.

- **Asking.** A toolbar button asks for suggestions, also from the palette. While waiting it shows it is working and cannot be pressed twice. The result opens in a popover anchored to the button. Nothing is sent anywhere until the writer presses it.
- **A suggestion** shows a title, the kind of module it would be (extension, editor replacement or project), the evidence (a quoted phrase from the text or a specific number from the activity summary), a short pitch, and a "Copy brief" button that puts a self-contained build brief on the clipboard. There are three to five, fewer and sharper preferred. None repeats a module that already exists. Evidence comes from what the model was shown; if the text or activity is too thin, the suggestion says so. A suggestion missing its title, evidence, pitch or brief is dropped, not half shown.
- **What is read.** The prose of the document in the last-focused pane. A long document is sent as its beginning and end (about 6000 characters in all) with the middle marked as left out. Notes and other asides in the text are not sent as prose.
- **What is recorded.** Editing activity, in total across all documents and sessions. It belongs to the writer, not the document: it is not in the file, and someone else opening the same document does not inherit it. It records:
  - number of edits, and distinct active minutes (a minute with an edit counts once);
  - characters inserted and deleted, and the deleted-to-inserted ratio;
  - large deletions (30 or more characters removed at once, with less than half put back) and in-place rewrites (4 or more characters replaced by 4 or more);
  - undos, counted as undos;
  - formatting applied, by kind and count;
  - paragraphs returned to: arriving at a paragraph one was not just editing is a visit, so typing a paragraph out is one visit and coming back later another. Paragraphs visited three or more times are "revisited". This one is kept for the session only and starts again after a reload.
- **Whose edits count.** Only the writer's own. Edits by another module, an agent, a collaborator or a restore do not count; a fix-up another module makes within the writer's own edit counts as theirs. Two panes on one document never count an edit twice. Moving the caret or selecting records nothing. Undo and redo count as undos and not as text inserted or deleted: an undo that removes 200 characters does not look like "200 cut".
- **The recording is visible.** The popover ends with a one-line footer of the totals (edits, active minutes, characters cut and written, paragraphs revisited, undos), or says nothing is recorded yet, never zeros or an error. A "Forget recorded activity" control clears the record (the footer then says nothing is recorded).
- **AI.** With AI off or no key, the button says what to do instead of failing; recording and the footer carry on. A bad status, a reply that isn't usable or one with no usable suggestions shows a short message in the popover. A reply wrapped in a code fence or given as a bare list is still accepted.
- **Several panes and turning off.** Recording continues whichever pane the writer types in. While the module is off nothing is recorded, and the earlier record is kept for when it is on again.
- **No document change.** Nothing is written to the document, so undo has nothing to do.
