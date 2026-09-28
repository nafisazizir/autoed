import { useState } from "react";
import type * as React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type Copy = { title: string; description: string; action: string };

/** A destructive confirmation, controlled from outside (for a menu item that opens it). */
export function ConfirmAlert({ open, onOpenChange, title, description, action, onConfirm }: Copy & { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel shape="rounded">Cancel</AlertDialogCancel>
          <AlertDialogAction shape="rounded" variant="destructive" onClick={() => { onOpenChange(false); onConfirm(); }}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The same confirmation opened by its own trigger. */
export function ConfirmDialog({ trigger, children, onConfirm, ...copy }: Copy & { trigger: React.ReactElement; children: React.ReactNode; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={trigger}>{children}</AlertDialogTrigger>
      </AlertDialog>
      <ConfirmAlert open={open} onOpenChange={setOpen} onConfirm={onConfirm} {...copy} />
    </>
  );
}
