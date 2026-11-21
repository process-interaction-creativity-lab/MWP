# QA: resizable-split

About five minutes. Have at least two documents in the project.

1. Place the module on a pane from its tab. Confirm it shows two inner panes side by side, each asking you to pick a document, and that each has its own tab after the split's. Confirm the split's tab menu has the Side by side | Stacked control and Add pane, and that neither inner tab offers Close pane yet.
2. Click into each inner pane and pick a different document with the document picker. Confirm each shows its document and edits independently. Choose a different set of modules in each pane's tab and confirm the change in one does not affect the other.
3. Drag the divider both ways. Confirm both panes resize live, scroll on their own, and cannot be dragged to nothing. Choose Stacked in the split's tab. Confirm the panes now stack, Stacked is selected in the control (and ticked in the palette), and that their documents and modules are unchanged.
4. Add a third pane. Confirm it starts with no document chosen and the others are unaffected. Pick a document for it. Close the middle pane from its tab. Confirm only that pane goes and the others keep their documents and modules.
5. Close panes until two remain. Confirm Close pane is no longer in either tab, and greyed in the palette. Edit text in one pane, switch focus to the other, and use Undo in each. Confirm Undo is per inner pane.
6. Put a split inside an inner pane. Confirm the nested split behaves the same way and the outer one is unaffected by its changes.
7. Reload. Confirm the orientation, the panes, and each pane's document and modules come back. Confirm a pane closed earlier does not return.
8. Turn the module off and on. Confirm the plain pane returns, then the split returns with the same panes. Also open the same document in two inner panes and confirm edits appear in both.
