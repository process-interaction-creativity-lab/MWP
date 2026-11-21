# deleted-words-printer: help

You like cutting text to cost something. This module counts the whole words you delete and, after every few, prints them as a small sticker on a Bluetooth thermal printer at your desk, so the discarded words are kept. It never changes your document.

## What it gives you

- **Connect printer** / **Disconnect printer** (toolbar): opens the browser's Bluetooth chooser; once connected, the same button disconnects. It reads "Connecting" while waiting.
- **Words per sticker** (toolbar, a number box from 1 to 200, default 5): how many deleted words make one sticker. Values outside the range are clamped.
- **The count** (toolbar, for example "3/5 waiting, 42 deleted"): words waiting for the next sticker, the batch size, and your lifetime total.
- **Stickers** (the printer): a "DELETED WORDS" heading, the words one per line, and a footer with the batch size and lifetime total.
- **Notices** (toolbar): a short reason when the chooser is cancelled, Bluetooth is missing, or a connection or print fails.

## Walkthrough

1. Turn the module on. The toolbar shows **Connect printer**, **Words per sticker** and the count.
2. Set **Words per sticker** to 3 to see it quickly.
3. Press **Connect printer** and pick your Phomemo T02 in the browser's chooser. The button changes to **Disconnect printer**.
4. In a document, select a whole word and delete it. The count goes up by one. Delete two more, and a sticker prints.
5. Try cutting only "llo" out of "hello", or one letter at a time: nothing counts. Punctuation next to a deleted word is not part of it.
6. Delete a whole paragraph. One sticker prints with a random sample of at most 40 words, and the lifetime total counts them all.
7. Press **Disconnect printer** and delete more words. Nothing is lost; the batch waits and prints when you reconnect.

## How the pieces fit

Deleting feeds the count, the count fills a batch, and a full batch becomes a sticker whenever the printer is connected and free. Only your own edits count: undo, redo and other modules' edits do not, and a document open in two panes counts a deletion once. The batch, size and total belong to you across all documents and are remembered after a reload; none of it travels with a file.

## Tips

- Needs a printer: a Phomemo T02 over Bluetooth, in a browser that supports Web Bluetooth.
- After a reload, or after turning the module off, reconnect by hand.
- Deleting a word, undoing and deleting it again counts it twice.
- A failed print keeps the batch; the next deletion tries again.
