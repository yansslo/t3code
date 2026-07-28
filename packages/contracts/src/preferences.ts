/**
 * Preferences shared between global server settings and per-project overrides.
 *
 * These live in their own module because both `settings.ts` and
 * `orchestration.ts` need them, and `settings.ts` already imports from
 * `orchestration.ts`.
 *
 * @module preferences
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

// ── Text generation instructions ─────────────────────────────────────
//
// Free-form guidance appended to the built-in commit/change-request prompts.
// The cap matches the `limitSection` budget the prompt builders apply, so a
// value that round-trips through settings always reaches the model intact.

export const MAX_TEXT_GENERATION_INSTRUCTIONS_LENGTH = 4_000;

const TextGenerationInstruction = TrimmedString.check(
  Schema.isMaxLength(MAX_TEXT_GENERATION_INSTRUCTIONS_LENGTH),
).pipe(Schema.withDecodingDefault(Effect.succeed("")));

export const TextGenerationInstructions = Schema.Struct({
  commit: TextGenerationInstruction,
  changeRequest: TextGenerationInstruction,
});
export type TextGenerationInstructions = typeof TextGenerationInstructions.Type;

export const EMPTY_TEXT_GENERATION_INSTRUCTIONS: TextGenerationInstructions = {
  commit: "",
  changeRequest: "",
};

// ── Worktree seed patterns ───────────────────────────────────────────
//
// Globs resolved against the project root and copied into each new worktree.
// Files git already placed in the worktree are never overwritten, so these are
// only useful for untracked files (`.env*` and friends).

export const MAX_WORKTREE_COPY_PATTERNS = 50;
export const MAX_WORKTREE_COPY_PATTERN_LENGTH = 512;

export const WorktreeCopyPattern = TrimmedNonEmptyString.check(
  Schema.isMaxLength(MAX_WORKTREE_COPY_PATTERN_LENGTH),
);
export type WorktreeCopyPattern = typeof WorktreeCopyPattern.Type;

export const WorktreeCopyPatterns = Schema.Array(WorktreeCopyPattern).check(
  Schema.isMaxLength(MAX_WORKTREE_COPY_PATTERNS),
);
export type WorktreeCopyPatterns = typeof WorktreeCopyPatterns.Type;

// ── Per-project overrides ────────────────────────────────────────────

/**
 * Project-level overrides for the matching global settings.
 *
 * Each field is independently optional, and an absent field means "inherit the
 * global value". A field that is present replaces the global value outright
 * rather than merging with it.
 */
export const ProjectPreferences = Schema.Struct({
  textGenerationInstructions: Schema.optional(TextGenerationInstructions),
  worktreeCopyPatterns: Schema.optional(WorktreeCopyPatterns),
});
export type ProjectPreferences = typeof ProjectPreferences.Type;

export const EMPTY_PROJECT_PREFERENCES: ProjectPreferences = {};
