type DialogElement = EventTarget & Pick<HTMLDialogElement, "open" | "showModal" | "close">;

type DialogNavigation = {
  readHash(): string;
  clearDialogHash(): void;
  restoreTriggerFocus(): void;
  subscribe(listener: () => void): () => void;
};

/** Keep a native modal dialog in sync with the bookmarkable audit URL. */
export function connectAuditDialog(dialog: DialogElement, navigation: DialogNavigation): () => void {
  const synchronize = () => {
    if (navigation.readHash() === "#audit-logs-modal") {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  };
  const closed = () => {
    // A queued close event from a previous mount must not close a reopened view.
    if (dialog.open) return;
    if (navigation.readHash() === "#audit-logs-modal") navigation.clearDialogHash();
    navigation.restoreTriggerFocus();
  };
  dialog.addEventListener("close", closed);
  const unsubscribe = navigation.subscribe(synchronize);
  synchronize();

  return () => {
    unsubscribe();
    dialog.removeEventListener("close", closed);
    if (dialog.open) dialog.close();
  };
}
