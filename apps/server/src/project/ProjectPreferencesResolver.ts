/**
 * Resolves the preferences that apply to a given project workspace.
 *
 * Three sources can supply a value, checked most-specific first and taken
 * outright rather than merged:
 *
 * 1. the project's stored overrides, edited in project settings;
 * 2. the checked-in `t3.json`, which teammates share through the repository;
 * 3. the global server settings.
 *
 * Each field falls back independently, so a project can override its commit
 * instructions while still inheriting the global copy patterns.
 *
 * Resolution never fails. Every source degrades to "unset" on error, because
 * these preferences decorate flows (committing, starting a thread) that must
 * not break when a config file is malformed.
 *
 * @module projectPreferencesResolver
 */
import {
  EMPTY_TEXT_GENERATION_INSTRUCTIONS,
  type ProjectPreferences,
  type T3ProjectFile,
  type TextGenerationInstructions,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as T3ProjectFileLoader from "./T3ProjectFileLoader.ts";

export interface ResolvedProjectPreferences {
  readonly textGenerationInstructions: TextGenerationInstructions;
  readonly worktreeCopyPatterns: ReadonlyArray<string>;
}

export const EMPTY_RESOLVED_PROJECT_PREFERENCES: ResolvedProjectPreferences = {
  textGenerationInstructions: EMPTY_TEXT_GENERATION_INSTRUCTIONS,
  worktreeCopyPatterns: [],
};

export interface ProjectPreferenceSources {
  readonly stored?: ProjectPreferences | undefined;
  readonly projectFile?: T3ProjectFile | undefined;
  readonly global: ResolvedProjectPreferences;
}

/**
 * Apply the precedence rules to already-loaded sources.
 *
 * Exported for tests; production code should go through
 * {@link ProjectPreferencesResolver} so the loading stays in one place.
 */
export function resolveProjectPreferences(
  sources: ProjectPreferenceSources,
): ResolvedProjectPreferences {
  const storedInstructions = sources.stored?.textGenerationInstructions;
  const fileInstructions = sources.projectFile?.textGeneration;

  // An empty string is treated as unset: it contributes nothing to a prompt,
  // so falling through to a less specific source is strictly more useful.
  const commit =
    storedInstructions?.commit ||
    fileInstructions?.commitInstructions ||
    sources.global.textGenerationInstructions.commit;
  const changeRequest =
    storedInstructions?.changeRequest ||
    fileInstructions?.changeRequestInstructions ||
    sources.global.textGenerationInstructions.changeRequest;

  // An empty array, by contrast, is a meaningful choice ("copy nothing"), so
  // only an absent list falls through.
  const worktreeCopyPatterns =
    sources.stored?.worktreeCopyPatterns ??
    sources.projectFile?.worktreeCopyFiles ??
    sources.global.worktreeCopyPatterns;

  return {
    textGenerationInstructions: { commit, changeRequest },
    worktreeCopyPatterns,
  };
}

export class ProjectPreferencesResolver extends Context.Service<
  ProjectPreferencesResolver,
  {
    readonly resolveForWorkspaceRoot: (
      workspaceRoot: string | null,
    ) => Effect.Effect<ResolvedProjectPreferences>;
  }
>()("t3/project/ProjectPreferencesResolver") {}

export const make = Effect.gen(function* () {
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const serverSettingsService = yield* ServerSettings.ServerSettingsService;
  const projectFileLoader = yield* T3ProjectFileLoader.T3ProjectFileLoader;

  const resolveForWorkspaceRoot: ProjectPreferencesResolver["Service"]["resolveForWorkspaceRoot"] =
    Effect.fn("ProjectPreferencesResolver.resolveForWorkspaceRoot")(function* (workspaceRoot) {
      const settings = yield* serverSettingsService.getSettings.pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("failed to read settings for project preferences", { cause }).pipe(
            Effect.as(null),
          ),
        ),
      );
      const global: ResolvedProjectPreferences = settings
        ? {
            textGenerationInstructions: settings.textGenerationInstructions,
            worktreeCopyPatterns: settings.worktreeCopyPatterns,
          }
        : EMPTY_RESOLVED_PROJECT_PREFERENCES;

      if (!workspaceRoot) {
        return global;
      }

      const stored = yield* projectionSnapshotQuery
        .getActiveProjectByWorkspaceRoot(workspaceRoot)
        .pipe(
          Effect.map((project) => Option.getOrUndefined(project)?.preferences),
          Effect.catchCause((cause) =>
            Effect.logWarning("failed to read project preferences", {
              workspaceRoot,
              cause,
            }).pipe(Effect.as(undefined)),
          ),
        );

      const projectFile = yield* projectFileLoader
        .load(workspaceRoot)
        .pipe(Effect.map(Option.getOrUndefined));

      return resolveProjectPreferences({
        global,
        ...(stored ? { stored } : {}),
        ...(projectFile ? { projectFile } : {}),
      });
    });

  return ProjectPreferencesResolver.of({ resolveForWorkspaceRoot });
});

export const layer = Layer.effect(ProjectPreferencesResolver, make);
