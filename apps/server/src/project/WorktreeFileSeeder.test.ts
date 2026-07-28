import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as WorktreeFileSeeder from "./WorktreeFileSeeder.ts";

const TestLayer = Layer.empty.pipe(
  Layer.provideMerge(WorktreeFileSeeder.layer),
  Layer.provideMerge(NodeServices.layer),
);

const writeTextFile = Effect.fn("writeTextFile")(function* (
  root: string,
  relativePath: string,
  contents = "",
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolutePath = path.join(root, relativePath);
  yield* fileSystem.makeDirectory(path.dirname(absolutePath), { recursive: true }).pipe(Effect.orDie);
  yield* fileSystem.writeFileString(absolutePath, contents).pipe(Effect.orDie);
});

const readTextFile = Effect.fn("readTextFile")(function* (root: string, relativePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fileSystem.readFileString(path.join(root, relativePath)).pipe(Effect.orDie);
});

/** Creates a project root and a sibling worktree directory. */
const makeRoots = Effect.fn("makeRoots")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const base = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3code-worktree-seed-" });
  const projectRoot = path.join(base, "project");
  const worktreePath = path.join(base, "worktree");
  yield* fileSystem.makeDirectory(projectRoot, { recursive: true }).pipe(Effect.orDie);
  yield* fileSystem.makeDirectory(worktreePath, { recursive: true }).pipe(Effect.orDie);
  return { projectRoot, worktreePath };
});

it.layer(TestLayer)("WorktreeFileSeeder", (it) => {
  describe("seed", () => {
    it.scoped("copies a literal match into the worktree", () =>
      Effect.gen(function* () {
        const seeder = yield* WorktreeFileSeeder.WorktreeFileSeeder;
        const { projectRoot, worktreePath } = yield* makeRoots();
        yield* writeTextFile(projectRoot, ".env", "SECRET=1");

        const result = yield* seeder.seed({
          projectRoot,
          worktreePath,
          patterns: [".env"],
        });

        expect(result.copied).toEqual([".env"]);
        expect(yield* readTextFile(worktreePath, ".env")).toBe("SECRET=1");
      }),
    );

    it.scoped("expands a wildcard across sibling files", () =>
      Effect.gen(function* () {
        const seeder = yield* WorktreeFileSeeder.WorktreeFileSeeder;
        const { projectRoot, worktreePath } = yield* makeRoots();
        yield* writeTextFile(projectRoot, ".env", "a");
        yield* writeTextFile(projectRoot, ".env.local", "b");
        yield* writeTextFile(projectRoot, "unrelated.txt", "c");

        const result = yield* seeder.seed({
          projectRoot,
          worktreePath,
          patterns: [".env*"],
        });

        expect([...result.copied].sort()).toEqual([".env", ".env.local"]);
      }),
    );

    it.scoped("never overwrites a file already in the worktree", () =>
      Effect.gen(function* () {
        const seeder = yield* WorktreeFileSeeder.WorktreeFileSeeder;
        const { projectRoot, worktreePath } = yield* makeRoots();
        yield* writeTextFile(projectRoot, ".env", "from project");
        yield* writeTextFile(worktreePath, ".env", "already here");

        const result = yield* seeder.seed({
          projectRoot,
          worktreePath,
          patterns: [".env"],
        });

        expect(result.copied).toEqual([]);
        expect(result.skipped).toEqual([".env"]);
        expect(yield* readTextFile(worktreePath, ".env")).toBe("already here");
      }),
    );

    it.scoped("creates missing parent directories for nested matches", () =>
      Effect.gen(function* () {
        const seeder = yield* WorktreeFileSeeder.WorktreeFileSeeder;
        const { projectRoot, worktreePath } = yield* makeRoots();
        yield* writeTextFile(projectRoot, "config/local.json", "{}");

        const result = yield* seeder.seed({
          projectRoot,
          worktreePath,
          patterns: ["config/local.json"],
        });

        expect(result.copied).toEqual(["config/local.json"]);
        expect(yield* readTextFile(worktreePath, "config/local.json")).toBe("{}");
      }),
    );

    it.scoped("ignores a pattern that matches a directory rather than a file", () =>
      Effect.gen(function* () {
        const seeder = yield* WorktreeFileSeeder.WorktreeFileSeeder;
        const { projectRoot, worktreePath } = yield* makeRoots();
        yield* writeTextFile(projectRoot, "config/local.json", "{}");

        const result = yield* seeder.seed({
          projectRoot,
          worktreePath,
          patterns: ["config"],
        });

        expect(result.copied).toEqual([]);
      }),
    );

    it.scoped("reports patterns that try to escape the project root", () =>
      Effect.gen(function* () {
        const seeder = yield* WorktreeFileSeeder.WorktreeFileSeeder;
        const { projectRoot, worktreePath } = yield* makeRoots();

        const result = yield* seeder.seed({
          projectRoot,
          worktreePath,
          patterns: ["../outside.env", "/etc/passwd"],
        });

        expect(result.copied).toEqual([]);
        expect(result.invalidPatterns).toEqual(["../outside.env", "/etc/passwd"]);
      }),
    );

    it.scoped("silently tolerates a pattern that matches nothing", () =>
      Effect.gen(function* () {
        const seeder = yield* WorktreeFileSeeder.WorktreeFileSeeder;
        const { projectRoot, worktreePath } = yield* makeRoots();

        const result = yield* seeder.seed({
          projectRoot,
          worktreePath,
          patterns: [".env", "missing/*.json"],
        });

        expect(result).toEqual(WorktreeFileSeeder.EMPTY_WORKTREE_FILE_SEED_RESULT);
      }),
    );

    it.scoped("does nothing when the worktree is the project itself", () =>
      Effect.gen(function* () {
        const seeder = yield* WorktreeFileSeeder.WorktreeFileSeeder;
        const { projectRoot } = yield* makeRoots();
        yield* writeTextFile(projectRoot, ".env", "a");

        const result = yield* seeder.seed({
          projectRoot,
          worktreePath: projectRoot,
          patterns: [".env"],
        });

        expect(result).toEqual(WorktreeFileSeeder.EMPTY_WORKTREE_FILE_SEED_RESULT);
      }),
    );

    it.scoped("copies each file once when patterns overlap", () =>
      Effect.gen(function* () {
        const seeder = yield* WorktreeFileSeeder.WorktreeFileSeeder;
        const { projectRoot, worktreePath } = yield* makeRoots();
        yield* writeTextFile(projectRoot, ".env", "a");

        const result = yield* seeder.seed({
          projectRoot,
          worktreePath,
          patterns: [".env", ".env*"],
        });

        expect(result.copied).toEqual([".env"]);
      }),
    );
  });
});
