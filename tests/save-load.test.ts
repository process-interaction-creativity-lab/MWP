import fc from 'fast-check';
import { expect, it } from 'vitest';
import { Project } from '../src/core/project.js';
import { buildSchema } from '../src/core/parts.js';
import { MemoryVault } from '../src/core/vault/memory.js';
import { arbitraryDocument } from './arbitraries.js';

const baseSchema = buildSchema([]);

it('save then load round-trips any document the base schema allows', async () => {
  await fc.assert(
    fc.asyncProperty(arbitraryDocument(baseSchema), async (doc) => {
      const vault = new MemoryVault();
      const project = await Project.open(vault);
      const { id } = await project.createDocument(baseSchema, 'Draft');
      await project.save(id, doc);
      await vault.flush();

      const reopened = await Project.open(vault.reopen());
      expect(reopened.documents).toEqual([{ id, name: 'Draft' }]);
      const { doc: loaded, error } = await reopened.load(baseSchema, id);
      expect(error).toBeNull();
      expect(loaded.eq(doc)).toBe(true);
    }),
  );
});
