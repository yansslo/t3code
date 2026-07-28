/**
 * Caller-supplied guidance layered onto the built-in generation prompts.
 *
 * A policy carries only free-form instruction text: the built-in rules in
 * `TextGenerationPrompts` always apply, and these strings are appended as an
 * "Additional instructions" section. An absent or empty field contributes
 * nothing to the prompt.
 *
 * @module textGenerationPolicy
 */
import * as Schema from "effect/Schema";

export const TextGenerationPolicy = Schema.Struct({
  commitInstructions: Schema.optional(Schema.String),
  changeRequestInstructions: Schema.optional(Schema.String),
  // Not user-configurable yet; the prompt builders already honor them, so a
  // future setting only has to populate these.
  branchInstructions: Schema.optional(Schema.String),
  threadTitleInstructions: Schema.optional(Schema.String),
});
export type TextGenerationPolicy = typeof TextGenerationPolicy.Type;

export const EMPTY_TEXT_GENERATION_POLICY: TextGenerationPolicy = {};

/**
 * Build a policy from resolved instruction text.
 *
 * Blank instructions are dropped rather than passed through as empty strings,
 * so the prompt builders omit the "Additional instructions" section entirely.
 */
export function textGenerationPolicyFromInstructions(instructions: {
  readonly commit: string;
  readonly changeRequest: string;
}): TextGenerationPolicy {
  return {
    ...(instructions.commit ? { commitInstructions: instructions.commit } : {}),
    ...(instructions.changeRequest
      ? { changeRequestInstructions: instructions.changeRequest }
      : {}),
  };
}
