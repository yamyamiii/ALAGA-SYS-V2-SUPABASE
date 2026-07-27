import { useEffect, useRef } from "react";

/**
 * Resets an in-memory dialog draft only at an intentional lifecycle boundary:
 * opening, closing, or switching to another create/edit target.
 *
 * The callback is deliberately excluded from the effect dependencies so query
 * refetches that replace a record object cannot erase an active draft.
 */
export function useDialogDraftLifecycle({ open, draftKey, resetDraft }) {
  const resetDraftRef = useRef(resetDraft);
  const lifecycleRef = useRef({ open: false, draftKey: undefined });
  resetDraftRef.current = resetDraft;

  useEffect(() => {
    const previous = lifecycleRef.current;
    const opening = open && !previous.open;
    const closing = !open && previous.open;
    const switchingDraft =
      open && previous.open && !Object.is(draftKey, previous.draftKey);

    lifecycleRef.current = { open, draftKey };
    if (opening || closing || switchingDraft) {
      resetDraftRef.current();
    }
  }, [draftKey, open]);
}
