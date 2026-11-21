// The toolbar's "Reset demo" button, in builds with a starter project (a
// preset's demo): after a confirmation, the page reloads with its storage
// emptied, but for the writer's settings, and opens the starter fresh.

import { useState } from 'react';
import { Button } from '../ui/components/button.js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/components/dialog.js';
import { starter } from './starter.js';
import { resetOnReload } from './storage.js';

export function ResetDemoButton() {
  const [open, setOpen] = useState(false);
  if (!starter) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="mwps-reset-button" onClick={() => setOpen(true)}>
        Reset demo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the demo?</DialogTitle>
            <DialogDescription>
              The demo starts again as it was on your first visit: your documents, your changes and any modules you turned on are gone from this browser. Your AI settings stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={resetOnReload}>
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
