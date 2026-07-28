import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

import { ProjectScriptIcon } from "./orchestration.ts";
import {
  MAX_TEXT_GENERATION_INSTRUCTIONS_LENGTH,
  MAX_WORKTREE_COPY_PATTERN_LENGTH,
  MAX_WORKTREE_COPY_PATTERNS,
} from "./preferences.ts";

/** File name of the checked-in T3 project file, resolved at the workspace root. */
export const T3_PROJECT_FILE_NAME = "t3.json";

/** Public URL of the published JSON Schema for {@link T3ProjectFile}. */
export const T3_PROJECT_FILE_SCHEMA_URL = "https://t3.codes/schema/t3.json";

const T3_PROJECT_FILE_PATH_MAX_LENGTH = 512;
const T3_PROJECT_FILE_MAX_SCRIPTS = 50;

// Annotations go on the encoded (string) side so they survive into the
// published JSON Schema; decoding still trims and re-validates non-emptiness.
const trimmedNonEmpty = (annotations: { readonly description: string }, maxLength?: number) => {
  const annotated = Schema.String.annotate(annotations);
  const encoded =
    maxLength === undefined
      ? annotated.check(Schema.isNonEmpty())
      : annotated.check(Schema.isNonEmpty(), Schema.isMaxLength(maxLength));
  return encoded.pipe(Schema.decodeTo(encoded, SchemaTransformation.trim()));
};

export const T3ProjectFileScript = Schema.Struct({
  name: trimmedNonEmpty({
    description: "Display name for the script, shown in the T3 Code scripts menu.",
  }),
  command: trimmedNonEmpty({
    description: "Shell command executed in a T3 Code terminal at the project root.",
  }),
  icon: Schema.optionalKey(
    ProjectScriptIcon.annotate({
      description: 'Icon shown next to the script in the scripts menu. Defaults to "play".',
    }),
  ),
  runOnWorktreeCreate: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "When true, the script runs automatically after a worktree is created for a new thread.",
    }),
  ),
  previewUrl: Schema.optionalKey(
    trimmedNonEmpty({
      description:
        "URL opened in the in-app browser preview when this script runs. Only honored on the desktop build.",
    }),
  ),
  autoOpenPreview: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "When true, automatically open the preview panel at `previewUrl` the moment the script starts.",
    }),
  ),
}).annotate({
  description: "A project script that team members can import into T3 Code.",
});
export type T3ProjectFileScript = typeof T3ProjectFileScript.Type;

export const T3ProjectFileTextGeneration = Schema.Struct({
  commitInstructions: Schema.optionalKey(
    trimmedNonEmpty(
      {
        description:
          "Extra guidance appended to the commit message prompt. Replaces the instructions configured in T3 Code settings.",
      },
      MAX_TEXT_GENERATION_INSTRUCTIONS_LENGTH,
    ),
  ),
  changeRequestInstructions: Schema.optionalKey(
    trimmedNonEmpty(
      {
        description:
          "Extra guidance appended to the pull request title/body prompt. Replaces the instructions configured in T3 Code settings.",
      },
      MAX_TEXT_GENERATION_INSTRUCTIONS_LENGTH,
    ),
  ),
}).annotate({
  description: "Project-specific guidance for generated commit messages and pull requests.",
});
export type T3ProjectFileTextGeneration = typeof T3ProjectFileTextGeneration.Type;

export const T3ProjectFile = Schema.Struct({
  $schema: Schema.optionalKey(
    Schema.String.annotate({
      description: `URL of the JSON Schema for this file, typically "${T3_PROJECT_FILE_SCHEMA_URL}".`,
    }),
  ),
  iconPath: Schema.optionalKey(
    trimmedNonEmpty(
      {
        description:
          'Workspace-relative path to the project icon (e.g. "assets/logo.svg"). Checked before T3 Code\'s built-in icon locations.',
      },
      T3_PROJECT_FILE_PATH_MAX_LENGTH,
    ),
  ),
  scripts: Schema.optionalKey(
    Schema.Array(T3ProjectFileScript)
      .annotate({
        description: "Project scripts shared with everyone who opens this repository in T3 Code.",
      })
      .check(Schema.isMaxLength(T3_PROJECT_FILE_MAX_SCRIPTS)),
  ),
  textGeneration: Schema.optionalKey(T3ProjectFileTextGeneration),
  worktreeCopyFiles: Schema.optionalKey(
    Schema.Array(
      trimmedNonEmpty(
        {
          description:
            'Glob relative to the repository root, e.g. ".env*" or "config/local.json". Only `*` and `?` are supported, and they never match across directory separators.',
        },
        MAX_WORKTREE_COPY_PATTERN_LENGTH,
      ),
    )
      .annotate({
        description:
          "Untracked files copied from the repository root into every new worktree. Files git already placed in the worktree are left alone. Replaces the patterns configured in T3 Code settings.",
      })
      .check(Schema.isMaxLength(MAX_WORKTREE_COPY_PATTERNS)),
  ),
}).annotate({
  title: "T3 project file",
  description:
    "Checked-in project configuration for T3 Code (t3.json at the repository root). See https://t3.codes for documentation.",
});
export type T3ProjectFile = typeof T3ProjectFile.Type;
