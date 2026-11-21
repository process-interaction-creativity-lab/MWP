// Test module: imports a data file, fetches it by URL and shows what came
// back in a body attribute, with the URL it fetched.
import type { ModuleContext } from 'mwps';
import wordsUrl from './words.txt';

export function setup(_ctx: ModuleContext) {
  document.body.dataset.e2eDataUrl = wordsUrl;
  void fetch(wordsUrl)
    .then((res) => res.text())
    .then((text) => (document.body.dataset.e2eData = text.trim()));
}
