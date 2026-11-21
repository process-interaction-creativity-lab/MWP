// A module's summary for the writer: the first paragraph of its
// `description.md`, right under the title, shown in the module picker.

export const SUMMARY_MAX_WORDS = 60;

export type Summary = { summary: string } | { problem: string };

export function summaryOf(markdown: string): Summary {
  const lines = markdown.split('\n');
  if (!/^# \S/.test(lines[0] ?? '')) return { problem: 'description.md must start with its title, "# <id>: description"' };
  let i = 1;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  const paragraph: string[] = [];
  for (; i < lines.length && lines[i]!.trim() !== ''; i++) paragraph.push(lines[i]!.trim());
  const text = paragraph.join(' ');
  const need = `the first paragraph under the title is the module's summary for the writer, in plain text`;
  if (text === '' || /^(#|>|-|\*|\||\d+\.)/.test(text)) return { problem: `${need}; it is missing` };
  if (/`|\]\(|\*|(^|\s)_\S/.test(text)) return { problem: `${need}: no code, links or emphasis` };
  const words = text.split(/\s+/).length;
  if (words > SUMMARY_MAX_WORDS) return { problem: `${need}, at most ${SUMMARY_MAX_WORDS} words; it has ${words}` };
  return { summary: text };
}
