/**
 * Matching rules for the files copied from a project root into a new worktree.
 *
 * Deliberately a small subset of glob syntax rather than a dependency: the
 * patterns users write here are things like `.env*` and `config/local.json`.
 * `*` and `?` match within a single path segment and never across `/`, and
 * there is no `**`, no brace expansion, and no directory recursion — a pattern
 * always names files, never a tree.
 *
 * @module worktreeCopy
 */

/** Path segments never descended into while resolving a pattern. */
const IGNORED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  ".turbo",
  "dist",
  "build",
]);

/** True when `name` is a directory that pattern resolution should skip. */
export function isIgnoredWorktreeCopyDirectory(name: string): boolean {
  return IGNORED_DIRECTORY_NAMES.has(name);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile one path segment of a pattern into an anchored matcher.
 *
 * A literal segment compiles to an exact comparison; only `*` and `?` are
 * treated as wildcards.
 */
function segmentMatcher(segment: string): (candidate: string) => boolean {
  if (!segment.includes("*") && !segment.includes("?")) {
    return (candidate) => candidate === segment;
  }
  const source = segment
    .split("")
    .map((character) => {
      if (character === "*") {
        return "[^/]*";
      }
      if (character === "?") {
        return "[^/]";
      }
      return escapeRegExp(character);
    })
    .join("");
  const compiled = new RegExp(`^${source}$`);
  return (candidate) => compiled.test(candidate);
}

export interface WorktreeCopyPatternSegments {
  /** Leading literal directory segments, if any. */
  readonly directorySegments: ReadonlyArray<string>;
  /** The final segment verbatim; a literal filename when `isWildcard` is false. */
  readonly fileSegment: string;
  /** Matcher for the final segment, which always names files. */
  readonly matchesFileName: (candidate: string) => boolean;
  /** True when the final segment contains a wildcard. */
  readonly isWildcard: boolean;
}

/**
 * Split a pattern into its directory prefix and file matcher.
 *
 * Returns `null` for patterns that cannot safely resolve inside the project:
 * absolute paths, empty patterns, anything containing `..`, and wildcards in a
 * directory position (which would imply the tree walk this feature avoids).
 */
export function parseWorktreeCopyPattern(pattern: string): WorktreeCopyPatternSegments | null {
  const normalized = pattern.trim().replaceAll("\\", "/");
  if (normalized === "" || normalized.startsWith("/")) {
    return null;
  }
  // Windows drive-absolute paths (`C:/...`) are not project-relative either.
  if (/^[A-Za-z]:/.test(normalized)) {
    return null;
  }

  const segments = normalized.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.length === 0) {
    return null;
  }
  if (segments.includes("..")) {
    return null;
  }

  const fileSegment = segments[segments.length - 1];
  if (fileSegment === undefined) {
    return null;
  }
  const directorySegments = segments.slice(0, -1);
  if (directorySegments.some((segment) => segment.includes("*") || segment.includes("?"))) {
    return null;
  }
  if (directorySegments.some((segment) => isIgnoredWorktreeCopyDirectory(segment))) {
    return null;
  }

  return {
    directorySegments,
    fileSegment,
    matchesFileName: segmentMatcher(fileSegment),
    // Lets callers stat a literal path directly instead of listing a directory.
    isWildcard: fileSegment.includes("*") || fileSegment.includes("?"),
  };
}

/** Drop blank and duplicate patterns while preserving the configured order. */
export function normalizeWorktreeCopyPatterns(
  patterns: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (trimmed === "" || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * Parse a newline-separated pattern textarea into a pattern list.
 *
 * Blanks and duplicates are dropped so the stored list matches what pattern
 * resolution would collapse it to anyway.
 */
export function parseWorktreeCopyPatternInput(value: string): ReadonlyArray<string> {
  return normalizeWorktreeCopyPatterns(value.split("\n"));
}
