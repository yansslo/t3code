import { type ChangeEvent, type KeyboardEvent, useState } from "react";

type CommitOnBlurElement = HTMLInputElement | HTMLTextAreaElement;

export interface UseCommitOnBlurOptions {
  /**
   * Whether Enter commits the value. Defaults to `true`, which suits
   * single-line inputs; multi-line controls pass `false` so Enter inserts a
   * newline instead.
   */
  readonly commitOnEnter?: boolean;
}

/**
 * Buffer text input locally so keystrokes don't cause a settings-wide
 * re-render (and optionally a server RPC round-trip) on every character.
 * `onCommit` fires on blur, and on Enter unless `commitOnEnter` is false.
 *
 * The draft resynchronizes from the upstream `value` only when the input
 * is not focused, so an external push (e.g. an optimistic settings
 * update from the user's own commit, or a reset to defaults) doesn't
 * clobber an in-progress edit.
 *
 * Returns a bag of props that should be spread onto an `<Input>`:
 *
 *   const bag = useCommitOnBlur(instance.displayName ?? "", (next) => {...});
 *   <Input {...bag} placeholder="e.g. Work" />
 */
export function useCommitOnBlur<E extends CommitOnBlurElement = HTMLInputElement>(
  value: string,
  onCommit: (next: string) => void,
  options?: UseCommitOnBlurOptions,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const commitOnEnter = options?.commitOnEnter ?? true;

  return {
    value: draft ?? value,
    onChange: (event: ChangeEvent<E>) => {
      setDraft(event.target.value);
    },
    onFocus: () => {
      setDraft(value);
    },
    onBlur: () => {
      const next = draft ?? value;
      setDraft(null);
      if (next !== value) {
        onCommit(next);
      }
    },
    onKeyDown: (event: KeyboardEvent<E>) => {
      if (commitOnEnter && event.key === "Enter") {
        event.preventDefault();
        (event.target as E).blur();
      }
    },
  };
}
