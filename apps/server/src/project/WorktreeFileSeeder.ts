/**
 * Seeds a freshly created worktree with untracked files from the project root.
 *
 * Git only populates a new worktree with tracked content, so per-developer
 * files (`.env.local` and friends) are missing until they are copied over.
 * This service resolves the configured patterns against the project root and
 * copies the matches in.
 *
 * Two rules shape the behavior:
 *
 * - A file already present in the worktree is never overwritten. In practice
 *   that means tracked files always win over a pattern that also matches them.
 * - Nothing here is fatal. Seeding runs on the thread bootstrap path, and a
 *   missing file or permission error must not stop the thread from starting,
 *   so failures are collected into the result and logged.
 *
 * @module worktreeFileSeeder
 */
import {
  isIgnoredWorktreeCopyDirectory,
  normalizeWorktreeCopyPatterns,
  parseWorktreeCopyPattern,
} from "@t3tools/shared/worktreeCopy";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

export interface WorktreeFileSeedFailure {
  /** Project-root-relative path, or the raw pattern when it never resolved. */
  readonly path: string;
  readonly detail: string;
}

export interface WorktreeFileSeedResult {
  /** Project-root-relative paths copied into the worktree. */
  readonly copied: ReadonlyArray<string>;
  /** Paths skipped because the worktree already had them. */
  readonly skipped: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<WorktreeFileSeedFailure>;
  /** Patterns rejected before resolution (absolute, escaping, or wildcard dirs). */
  readonly invalidPatterns: ReadonlyArray<string>;
}

export const EMPTY_WORKTREE_FILE_SEED_RESULT: WorktreeFileSeedResult = {
  copied: [],
  skipped: [],
  failed: [],
  invalidPatterns: [],
};

export interface WorktreeFileSeedInput {
  readonly projectRoot: string;
  readonly worktreePath: string;
  readonly patterns: ReadonlyArray<string>;
}

export class WorktreeFileSeeder extends Context.Service<
  WorktreeFileSeeder,
  {
    readonly seed: (input: WorktreeFileSeedInput) => Effect.Effect<WorktreeFileSeedResult>;
  }
>()("t3/project/WorktreeFileSeeder") {}

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const seed: WorktreeFileSeeder["Service"]["seed"] = Effect.fn("WorktreeFileSeeder.seed")(
    function* (input) {
      const patterns = normalizeWorktreeCopyPatterns(input.patterns);
      if (patterns.length === 0) {
        return EMPTY_WORKTREE_FILE_SEED_RESULT;
      }

      const projectRoot = path.resolve(input.projectRoot);
      const worktreePath = path.resolve(input.worktreePath);
      // A local thread runs in the project itself; there is nothing to seed.
      if (projectRoot === worktreePath) {
        return EMPTY_WORKTREE_FILE_SEED_RESULT;
      }

      const copied: string[] = [];
      const skipped: string[] = [];
      const failed: WorktreeFileSeedFailure[] = [];
      const invalidPatterns: string[] = [];
      const seenRelativePaths = new Set<string>();

      /** Resolve one pattern to the project-relative files it matches. */
      const resolveMatches = Effect.fn("WorktreeFileSeeder.resolveMatches")(function* (
        pattern: string,
      ) {
        const parsed = parseWorktreeCopyPattern(pattern);
        if (!parsed) {
          invalidPatterns.push(pattern);
          return [] as ReadonlyArray<string>;
        }

        const relativeDirectory = parsed.directorySegments.join("/");
        const absoluteDirectory = path.join(projectRoot, ...parsed.directorySegments);

        if (!parsed.isWildcard) {
          const fileName = parsed.fileSegment;
          const relativePath = relativeDirectory ? `${relativeDirectory}/${fileName}` : fileName;
          const info = yield* fileSystem
            .stat(path.join(absoluteDirectory, fileName))
            .pipe(Effect.orElseSucceed(() => null));
          return info !== null && info.type === "File"
            ? ([relativePath] as ReadonlyArray<string>)
            : ([] as ReadonlyArray<string>);
        }

        const entries: ReadonlyArray<string> = yield* fileSystem
          .readDirectory(absoluteDirectory)
          .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));

        const matches: string[] = [];
        for (const entry of entries) {
          if (!parsed.matchesFileName(entry) || isIgnoredWorktreeCopyDirectory(entry)) {
            continue;
          }
          const info = yield* fileSystem
            .stat(path.join(absoluteDirectory, entry))
            .pipe(Effect.orElseSucceed(() => null));
          if (info === null || info.type !== "File") {
            continue;
          }
          matches.push(relativeDirectory ? `${relativeDirectory}/${entry}` : entry);
        }
        return matches as ReadonlyArray<string>;
      });

      for (const pattern of patterns) {
        const matches = yield* resolveMatches(pattern);
        for (const relativePath of matches) {
          if (seenRelativePaths.has(relativePath)) {
            continue;
          }
          seenRelativePaths.add(relativePath);

          const target = path.join(worktreePath, relativePath);
          const alreadyPresent = yield* fileSystem
            .exists(target)
            .pipe(Effect.orElseSucceed(() => false));
          if (alreadyPresent) {
            skipped.push(relativePath);
            continue;
          }

          const failure = yield* fileSystem
            .makeDirectory(path.dirname(target), { recursive: true })
            .pipe(
              Effect.andThen(fileSystem.copyFile(path.join(projectRoot, relativePath), target)),
              Effect.match({
                onSuccess: () => null,
                onFailure: (error) => error,
              }),
            );
          if (failure === null) {
            copied.push(relativePath);
          } else {
            failed.push({ path: relativePath, detail: failure.message });
          }
        }
      }

      if (failed.length > 0 || invalidPatterns.length > 0) {
        yield* Effect.logWarning("worktree file seeding completed with problems", {
          projectRoot,
          worktreePath,
          failed,
          invalidPatterns,
        });
      }

      return { copied, skipped, failed, invalidPatterns };
    },
  );

  return WorktreeFileSeeder.of({ seed });
});

export const layer = Layer.effect(WorktreeFileSeeder, make);
