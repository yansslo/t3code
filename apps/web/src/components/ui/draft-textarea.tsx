"use client";

import { useCommitOnBlur } from "~/hooks/useCommitOnBlur";
import { Textarea, type TextareaProps } from "./textarea";

export type DraftTextareaProps = Omit<TextareaProps, "value" | "onChange" | "defaultValue"> & {
  readonly value: string;
  readonly onCommit: (next: string) => void;
};

/**
 * Multi-line counterpart to `DraftInput`: buffers keystrokes locally and
 * invokes `onCommit` on blur. Unlike the single-line control, Enter inserts a
 * newline rather than committing.
 */
export function DraftTextarea({ value, onCommit, ...rest }: DraftTextareaProps) {
  const bag = useCommitOnBlur<HTMLTextAreaElement>(value, onCommit, { commitOnEnter: false });
  return <Textarea {...rest} {...bag} />;
}
