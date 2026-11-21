import { describe, expect, it } from 'vitest';
import { aiFromLink, withLinkedAi } from './settings-data.js';

describe('AI settings from a link', () => {
  it('reads the key, address and model, and nothing when none is given', () => {
    expect(aiFromLink('?ai-key=sk-or-1&ai-url=https://openrouter.ai/api/v1&ai-model=deepseek%2Fdeepseek-v4.1-flash')).toEqual({
      key: 'sk-or-1',
      url: 'https://openrouter.ai/api/v1',
      model: 'deepseek/deepseek-v4.1-flash',
    });
    expect(aiFromLink('?ai-model=m&ai-key=')).toEqual({ model: 'm' });
    expect(aiFromLink('?modules=a,b')).toBeNull();
  });

  it("puts them over the default's, keeping its other fields and the modules' settings", () => {
    const settings = { ai: { key: 'old', url: 'https://old', model: 'old-model', extra: { a: 1 } }, modules: { m: { ai: false } } };
    expect(withLinkedAi(settings, { key: 'new', model: 'new-model' })).toEqual({
      ai: { key: 'new', url: 'https://old', model: 'new-model', extra: { a: 1 } },
      modules: { m: { ai: false } },
    });
    expect(withLinkedAi({ ai: null, modules: {} }, { key: 'k' }).ai).toEqual({ key: 'k', url: '', model: '' });
  });
});
