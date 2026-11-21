// A project is a vault: `project.json` lists the documents by id and name,
// and the project modules placed in it; each document is
// `documents/<id>.json`, its JSON (document-json.ts).

import type { Node, Schema } from 'prosemirror-model';
import { documentFromJson, documentToJson, emptyDocument, type LoadedDocument } from './document-json.js';
import type { StoredJson } from './parts.js';
import type { Vault } from './vault/vault.js';

export interface DocumentEntry {
  id: string;
  name: string;
}

interface Manifest {
  documents: DocumentEntry[];
  // Ids, in placement order; missing in projects made before it.
  projectModules?: string[];
}

const MANIFEST = 'project.json';
const documentPath = (id: string): string => `documents/${id}.json`;

export function serializeDocument(doc: Node): string {
  return JSON.stringify(documentToJson(doc));
}

export function parseDocument(schema: Schema, text: string): LoadedDocument {
  return documentFromJson(schema, JSON.parse(text) as StoredJson);
}

export class Project {
  private manifest: Manifest;
  private readonly listeners = new Set<() => void>();

  private constructor(
    readonly vault: Vault,
    manifest: Manifest,
  ) {
    this.manifest = manifest;
  }

  static async open(vault: Vault): Promise<Project> {
    const text = await vault.read(MANIFEST);
    return new Project(vault, text === null ? { documents: [] } : (JSON.parse(text) as Manifest));
  }

  // A store: `documents` is a new array after every change.
  get documents(): readonly DocumentEntry[] {
    return this.manifest.documents;
  }

  get projectModules(): readonly string[] {
    return this.manifest.projectModules ?? [];
  }

  async setProjectModules(ids: readonly string[]): Promise<void> {
    await this.setManifest({ ...this.manifest, projectModules: [...ids] });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async createDocument(schema: Schema, name: string): Promise<DocumentEntry> {
    const entry = { id: crypto.randomUUID(), name };
    await this.vault.write(documentPath(entry.id), serializeDocument(emptyDocument(schema)));
    await this.setManifest({ ...this.manifest, documents: [...this.manifest.documents, entry] });
    return entry;
  }

  async renameDocument(id: string, name: string): Promise<void> {
    const documents = this.manifest.documents.map((d) => (d.id === id ? { ...d, name } : d));
    await this.setManifest({ ...this.manifest, documents });
  }

  // Leaves the list first, so a pane showing it closes before the file goes.
  async deleteDocument(id: string): Promise<void> {
    await this.setManifest({ ...this.manifest, documents: this.manifest.documents.filter((d) => d.id !== id) });
    await this.vault.delete(documentPath(id));
  }

  async load(schema: Schema, id: string): Promise<LoadedDocument> {
    const text = await this.vault.read(documentPath(id));
    if (text === null) throw new Error(`document ${id} is missing from the project`);
    return parseDocument(schema, text);
  }

  // The vault debounces, so calling this on every change is fine.
  save(id: string, doc: Node): Promise<void> {
    return this.vault.write(documentPath(id), serializeDocument(doc));
  }

  private async setManifest(manifest: Manifest): Promise<void> {
    this.manifest = manifest;
    await this.vault.write(MANIFEST, JSON.stringify(manifest, null, 2));
    for (const l of this.listeners) l();
  }
}
