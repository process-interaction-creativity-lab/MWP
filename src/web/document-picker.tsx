// The document picker, at the toolbar's far left: shows the document of the
// pane it switches and every document in the project. Each row renames
// and deletes on hover; a typed name that isn't there offers "Create".
// Hovered or open, it outlines the pane it switches, as a pane's tab does.

import { Check, ChevronDown, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '../ui/components/button.js';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/components/command.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/components/dialog.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/popover.js';
import { PaneOutline } from './pane-outline.js';

export interface DocumentChoice {
  readonly id: string;
  readonly name: string;
}

export function DocumentPicker({
  paneId,
  documents,
  current,
  onPick,
  onCreate,
  onRename,
  onDelete,
}: {
  paneId: string;
  documents: readonly DocumentChoice[];
  current: string | null;
  onPick(id: string): void;
  onCreate(name: string): void;
  onRename(id: string, name: string): void;
  onDelete(id: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DocumentChoice | null>(null);
  const name = current === null ? null : (documents.find((d) => d.id === current)?.name ?? 'Document');
  const typed = query.trim();

  const close = () => {
    setOpen(false);
    setQuery('');
    setRenaming(null);
  };
  const finishRename = (id: string, value: string | null) => {
    setRenaming(null);
    const next = value?.trim();
    if (next && next !== documents.find((d) => d.id === id)?.name) onRename(id, next);
  };

  return (
    <>
      {(hovered || open) && <PaneOutline paneId={paneId} />}
      <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label="Document"
            className="tw:bg-background tw:max-w-56"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <FileText />
            <span className={`tw:truncate ${name === null ? 'tw:text-muted-foreground' : ''}`}>
              {name ?? 'Select a document'}
            </span>
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="tw:w-72 tw:p-0">
          <Command>
            <CommandInput placeholder="Find or create a document…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandGroup>
                {documents.map((d) =>
                  renaming === d.id ? (
                    <input
                      key={d.id}
                      className="mwps-rename"
                      aria-label="Document name"
                      defaultValue={d.name}
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={(e) => finishRename(d.id, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        // The list would take Enter and the arrows.
                        e.stopPropagation();
                        if (e.key === 'Enter') finishRename(d.id, e.currentTarget.value);
                        if (e.key === 'Escape') finishRename(d.id, null);
                      }}
                    />
                  ) : (
                    <CommandItem
                      key={d.id}
                      value={`${d.name} ${d.id}`}
                      data-document={d.name}
                      onSelect={() => {
                        close();
                        onPick(d.id);
                      }}
                    >
                      <Check className={d.id === current ? '' : 'tw:invisible'} />
                      <span className="tw:truncate">{d.name}</span>
                      <span className="tw:ml-auto tw:flex">
                        <RowAction label={`Rename ${d.name}`} onClick={() => setRenaming(d.id)}>
                          <Pencil />
                        </RowAction>
                        <RowAction
                          label={`Delete ${d.name}`}
                          onClick={() => {
                            close();
                            setDeleting(d);
                          }}
                        >
                          <Trash2 />
                        </RowAction>
                      </span>
                    </CommandItem>
                  ),
                )}
              </CommandGroup>
              <CommandGroup forceMount>
                <CommandItem
                  value={`create ${typed}`}
                  forceMount
                  onSelect={() => {
                    close();
                    onCreate(typed && !documents.some((d) => d.name === typed) ? typed : '');
                  }}
                >
                  <Plus />
                  {typed && !documents.some((d) => d.name === typed) ? `Create “${typed}”` : 'New document'}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              The document is removed from the project. Panes showing it show no document, and cards on it close. This
              can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) onDelete(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// A small button on a row; choosing it doesn't choose the row.
function RowAction({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="mwps-row-action tw:size-6"
      aria-label={label}
      title={label.split(' ')[0]}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}
