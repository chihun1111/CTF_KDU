"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { connectAuditDialog } from "../lib/audit-dialog";

export function AuditLogDialog({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    return connectAuditDialog(dialog, {
      readHash: () => window.location.hash,
      clearDialogHash: () => {
        const url = new URL(window.location.href);
        url.hash = "audit-logs";
        window.history.replaceState(window.history.state, "", url);
      },
      restoreTriggerFocus: () => document.getElementById("audit-logs-trigger")?.focus(),
      subscribe: (listener) => {
        window.addEventListener("hashchange", listener);
        window.addEventListener("popstate", listener);
        return () => {
          window.removeEventListener("hashchange", listener);
          window.removeEventListener("popstate", listener);
        };
      },
    });
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="auditModal"
      id="audit-logs-modal"
      aria-labelledby="audit-logs-title"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="auditModalPanel">{children}</div>
    </dialog>
  );
}
