import assert from "node:assert/strict";
import { test } from "node:test";
import { connectAuditDialog } from "../app/lib/audit-dialog";

class TestDialog extends EventTarget {
  open = false;
  opens = 0;
  showModal() { this.open = true; this.opens += 1; }
  close() { this.open = false; this.dispatchEvent(new Event("close")); }
}

test("audit deep links open a native modal and close events restore the URL and trigger focus", () => {
  const dialog = new TestDialog();
  let hash = "#audit-logs-modal";
  let focusRestored = 0;
  let onNavigation = () => {};
  let unsubscribed = false;
  const disconnect = connectAuditDialog(dialog, {
    readHash: () => hash,
    clearDialogHash: () => { hash = "#audit-logs"; },
    restoreTriggerFocus: () => { focusRestored += 1; },
    subscribe: (listener) => { onNavigation = listener; return () => { unsubscribed = true; }; },
  });
  assert.equal(dialog.open, true);
  onNavigation();
  assert.equal(dialog.opens, 1, "refresh/navigation must not reopen or reset focus in an open modal");
  dialog.dispatchEvent(new Event("close"));
  assert.equal(hash, "#audit-logs-modal", "ignore stale close events while the modal is open");
  dialog.close();
  assert.equal(hash, "#audit-logs");
  assert.equal(focusRestored, 1);

  hash = "#audit-logs-modal";
  onNavigation();
  assert.equal(dialog.open, true);
  hash = "#participants";
  onNavigation();
  assert.equal(dialog.open, false);
  assert.equal(hash, "#participants");
  disconnect();
  assert.equal(unsubscribed, true);
});

test("unmounting an audit dialog cleans up without rewriting another page's URL", () => {
  const dialog = new TestDialog();
  let hash = "#audit-logs-modal";
  const disconnect = connectAuditDialog(dialog, {
    readHash: () => hash,
    clearDialogHash: () => { hash = "#audit-logs"; },
    restoreTriggerFocus: () => { throw new Error("focus must not return to an unmounted trigger"); },
    subscribe: () => () => {},
  });
  disconnect();
  assert.equal(dialog.open, false);
  assert.equal(hash, "#audit-logs-modal");
});
