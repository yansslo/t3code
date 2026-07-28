import { describe, expect, it } from "vitest";

import {
  normalizeWorktreeCopyPatterns,
  parseWorktreeCopyPattern,
  parseWorktreeCopyPatternInput,
} from "./worktreeCopy.ts";

describe("parseWorktreeCopyPattern", () => {
  it("treats a bare filename as a root-level literal", () => {
    const parsed = parseWorktreeCopyPattern(".env");
    expect(parsed).not.toBeNull();
    expect(parsed?.directorySegments).toEqual([]);
    expect(parsed?.isWildcard).toBe(false);
    expect(parsed?.matchesFileName(".env")).toBe(true);
    expect(parsed?.matchesFileName(".env.local")).toBe(false);
  });

  it("matches a trailing wildcard within one segment", () => {
    const parsed = parseWorktreeCopyPattern(".env*");
    expect(parsed?.isWildcard).toBe(true);
    expect(parsed?.matchesFileName(".env")).toBe(true);
    expect(parsed?.matchesFileName(".env.local")).toBe(true);
    expect(parsed?.matchesFileName("env")).toBe(false);
  });

  it("never lets a wildcard cross a directory separator", () => {
    const parsed = parseWorktreeCopyPattern("*.json");
    expect(parsed?.matchesFileName("a.json")).toBe(true);
    expect(parsed?.matchesFileName("nested/a.json")).toBe(false);
  });

  it("splits literal directory segments from the file segment", () => {
    const parsed = parseWorktreeCopyPattern("config/local.json");
    expect(parsed?.directorySegments).toEqual(["config"]);
    expect(parsed?.matchesFileName("local.json")).toBe(true);
  });

  it("supports ? as a single-character wildcard", () => {
    const parsed = parseWorktreeCopyPattern(".env.?");
    expect(parsed?.matchesFileName(".env.a")).toBe(true);
    expect(parsed?.matchesFileName(".env.ab")).toBe(false);
  });

  it("treats regex metacharacters in a literal segment as literal", () => {
    const parsed = parseWorktreeCopyPattern("a+b.json");
    expect(parsed?.matchesFileName("a+b.json")).toBe(true);
    expect(parsed?.matchesFileName("aab.json")).toBe(false);
  });

  it("normalizes backslash separators", () => {
    const parsed = parseWorktreeCopyPattern("config\\local.json");
    expect(parsed?.directorySegments).toEqual(["config"]);
    expect(parsed?.matchesFileName("local.json")).toBe(true);
  });

  it.each([
    ["an empty pattern", "   "],
    ["an absolute path", "/etc/passwd"],
    ["a windows drive path", "C:/secrets.txt"],
    ["a parent traversal", "../outside.env"],
    ["a nested parent traversal", "config/../../outside.env"],
    ["a wildcard directory", "*/local.json"],
    ["an ignored directory", "node_modules/.bin/thing"],
  ])("rejects %s", (_label, pattern) => {
    expect(parseWorktreeCopyPattern(pattern)).toBeNull();
  });
});

describe("normalizeWorktreeCopyPatterns", () => {
  it("drops blanks and duplicates while preserving order", () => {
    expect(normalizeWorktreeCopyPatterns([" .env ", "", ".env", "config/a.json", "   "])).toEqual([
      ".env",
      "config/a.json",
    ]);
  });
});

describe("parseWorktreeCopyPatternInput", () => {
  it("reads one pattern per line", () => {
    expect(parseWorktreeCopyPatternInput(".env\n\n.env.local\n.env\n")).toEqual([
      ".env",
      ".env.local",
    ]);
  });
});
