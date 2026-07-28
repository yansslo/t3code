import { describe, expect, it } from "vitest";

import {
  EMPTY_RESOLVED_PROJECT_PREFERENCES,
  resolveProjectPreferences,
} from "./ProjectPreferencesResolver.ts";

const global = {
  textGenerationInstructions: { commit: "global commit", changeRequest: "global pr" },
  worktreeCopyPatterns: [".env"],
};

describe("resolveProjectPreferences", () => {
  it("falls back to the global values when nothing else is set", () => {
    expect(resolveProjectPreferences({ global })).toEqual(global);
  });

  it("lets a stored override replace the global instructions", () => {
    const resolved = resolveProjectPreferences({
      global,
      stored: { textGenerationInstructions: { commit: "project commit", changeRequest: "" } },
    });
    expect(resolved.textGenerationInstructions.commit).toBe("project commit");
  });

  it("falls back per field rather than per object", () => {
    const resolved = resolveProjectPreferences({
      global,
      stored: { textGenerationInstructions: { commit: "project commit", changeRequest: "" } },
    });
    // `changeRequest` was left blank, so the global value still applies.
    expect(resolved.textGenerationInstructions.changeRequest).toBe("global pr");
  });

  it("prefers a stored override over t3.json", () => {
    const resolved = resolveProjectPreferences({
      global,
      stored: { textGenerationInstructions: { commit: "stored", changeRequest: "" } },
      projectFile: { textGeneration: { commitInstructions: "from file" } },
    });
    expect(resolved.textGenerationInstructions.commit).toBe("stored");
  });

  it("uses t3.json when there is no stored override", () => {
    const resolved = resolveProjectPreferences({
      global,
      projectFile: { textGeneration: { commitInstructions: "from file" } },
    });
    expect(resolved.textGenerationInstructions.commit).toBe("from file");
  });

  it("replaces the global copy patterns with the project's", () => {
    const resolved = resolveProjectPreferences({
      global,
      stored: { worktreeCopyPatterns: ["config/local.json"] },
    });
    expect(resolved.worktreeCopyPatterns).toEqual(["config/local.json"]);
  });

  it("treats an explicitly empty pattern list as 'copy nothing'", () => {
    const resolved = resolveProjectPreferences({
      global,
      stored: { worktreeCopyPatterns: [] },
    });
    expect(resolved.worktreeCopyPatterns).toEqual([]);
  });

  it("inherits patterns when the project sets none", () => {
    const resolved = resolveProjectPreferences({
      global,
      stored: { textGenerationInstructions: { commit: "x", changeRequest: "" } },
    });
    expect(resolved.worktreeCopyPatterns).toEqual([".env"]);
  });

  it("resolves to nothing when every source is empty", () => {
    expect(
      resolveProjectPreferences({ global: EMPTY_RESOLVED_PROJECT_PREFERENCES }),
    ).toEqual(EMPTY_RESOLVED_PROJECT_PREFERENCES);
  });
});
