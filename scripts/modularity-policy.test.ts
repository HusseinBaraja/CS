import { describe, expect, test } from 'bun:test';
import {
  countLinesFromText,
  evaluateModularityPolicy,
  isPathInScope,
  parsePolicy,
  renderJsonReport,
  renderMarkdownReport,
  type ModularityPolicy,
} from './modularity-policy';

const createPolicy = (overrides: Partial<ModularityPolicy> = {}): ModularityPolicy => ({
  version: 1,
  thresholds: {
    coreLogicMaxLines: 240,
  },
  scope: {
    include: ["apps/**/*.ts", "packages/**/*.ts", "convex/**/*.ts"],
    exclude: [
      "apps/web/**",
      "**/*.test.ts",
      "**/*.vitest.ts",
      "**/*.typecheck.ts",
      "**/*.d.ts",
      "convex/_generated/**",
      "dist/**",
      "**/dist/**",
      "node_modules/**",
      "**/node_modules/**",
    ],
  },
  entries: [],
  ...overrides,
});

describe("path scope resolution", () => {
  const policy = createPolicy();

  test("includes core backend paths", () => {
    expect(isPathInScope("apps/api/src/app.ts", policy)).toBe(true);
    expect(isPathInScope("packages/rag/src/index.ts", policy)).toBe(true);
    expect(isPathInScope("convex/products.ts", policy)).toBe(true);
  });

  test("excludes frontend, tests, generated, and declaration files", () => {
    expect(isPathInScope("apps/web/src/main.ts", policy)).toBe(false);
    expect(isPathInScope("apps/api/src/app.test.ts", policy)).toBe(false);
    expect(isPathInScope("apps/api/src/app.vitest.ts", policy)).toBe(false);
    expect(isPathInScope("apps/api/src/app.typecheck.ts", policy)).toBe(false);
    expect(isPathInScope("convex/_generated/server.ts", policy)).toBe(false);
    expect(isPathInScope("convex/_generated/server.d.ts", policy)).toBe(false);
    expect(isPathInScope("apps/api/node_modules/foo/index.ts", policy)).toBe(false);
    expect(isPathInScope("apps/api/dist/index.ts", policy)).toBe(false);
  });
});

describe("line counting", () => {
  test("counts deterministic line totals", () => {
    expect(countLinesFromText("")).toBe(0);
    expect(countLinesFromText("one")).toBe(1);
    expect(countLinesFromText("one\ntwo")).toBe(2);
    expect(countLinesFromText("one\ntwo\n")).toBe(2);
    expect(countLinesFromText("one\r\ntwo\r\n")).toBe(2);
  });
});

describe("policy evaluation", () => {
  test("fails oversized file without policy entry", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy(),
      fileLines: {
        "apps/api/src/newLargeModule.ts": 241,
      },
    });

    expect(evaluation.violations.some((violation) => violation.code === "missing_classification_for_oversized")).toBe(
      true,
    );
  });

  test("fails oversized file growth beyond maxLines", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy({
        entries: [
          {
            path: "apps/api/src/routes/products.ts",
            classification: "must_split",
            maxLines: 300,
            reason: "Debt module",
          },
        ],
      }),
      fileLines: {
        "apps/api/src/routes/products.ts": 301,
      },
    });

    expect(evaluation.violations.some((violation) => violation.code === "oversized_file_exceeds_max_lines")).toBe(
      true,
    );
  });

  test("passes at exact baseline maxLines", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy({
        entries: [
          {
            path: "apps/api/src/routes/products.ts",
            classification: "must_split",
            maxLines: 310,
            reason: "Debt module",
          },
        ],
      }),
      fileLines: {
        "apps/api/src/routes/products.ts": 310,
      },
    });

    expect(evaluation.violations).toHaveLength(0);
  });

  test("passes file below threshold without entry", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy(),
      fileLines: {
        "apps/api/src/routes/tiny.ts": 90,
      },
    });

    expect(evaluation.violations).toHaveLength(0);
  });

  test("fails stale policy entries that point to missing files", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy({
        entries: [
          {
            path: "apps/api/src/routes/missing.ts",
            classification: "must_split",
            maxLines: 500,
            reason: "Old entry",
          },
        ],
      }),
      fileLines: {},
    });

    expect(evaluation.violations.some((violation) => violation.code === "policy_entry_missing_file")).toBe(true);
  });

  test("fails allowlisted entries that have dropped to threshold or below", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy({
        entries: [
          {
            path: "apps/api/src/routes/products.ts",
            classification: "must_split",
            maxLines: 310,
            reason: "Debt module",
          },
        ],
      }),
      fileLines: {
        "apps/api/src/routes/products.ts": 240,
      },
    });

    expect(evaluation.violations.some((violation) => violation.code === "allowlist_entry_below_threshold")).toBe(
      true,
    );
  });

  test("fails excluded non-core entries without reason", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy({
        entries: [
          {
            path: "convex/schema.ts",
            classification: "excluded_non_core",
            reason: "",
          },
        ],
      }),
      fileLines: {
        "convex/schema.ts": 289,
      },
    });

    expect(evaluation.violations.some((violation) => violation.code === "excluded_entry_missing_reason")).toBe(true);
  });

  test("fails duplicate policy entries for the same path", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy({
        entries: [
          {
            path: "apps/api/src/routes/dupe.ts",
            classification: "must_split",
            maxLines: 300,
            reason: "First entry",
          },
          {
            path: "apps/api/src/routes/dupe.ts",
            classification: "must_split",
            maxLines: 310,
            reason: "Duplicate entry",
          },
        ],
      }),
      fileLines: {
        "apps/api/src/routes/dupe.ts": 301,
      },
    });

    expect(evaluation.violations.some((violation) => violation.code === "duplicate_policy_entry")).toBe(true);
  });

  test("fails invalid classification entries", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy({
        entries: [
          {
            path: "apps/api/src/routes/invalid-classification.ts",
            classification: "not_real_classification",
            reason: "Invalid",
          },
        ],
      }),
      fileLines: {
        "apps/api/src/routes/invalid-classification.ts": 300,
      },
    });

    expect(evaluation.violations.some((violation) => violation.code === "invalid_policy_entry")).toBe(true);
  });

  test("fails allowlisted entries when maxLines is below threshold", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy({
        entries: [
          {
            path: "apps/api/src/routes/products.ts",
            classification: "must_split",
            maxLines: 200,
            reason: "Invalid baseline",
          },
        ],
      }),
      fileLines: {
        "apps/api/src/routes/products.ts": 245,
      },
    });

    expect(evaluation.violations.some((violation) => violation.code === "invalid_policy_entry")).toBe(true);
  });
});

describe("policy parsing", () => {
  test("throws on non-string classification with entry index and path", () => {
    expect(() =>
      parsePolicy({
        version: 1,
        thresholds: { coreLogicMaxLines: 240 },
        scope: { include: ["apps/**/*.ts"], exclude: [] },
        entries: [
          {
            path: "apps/api/src/routes/a.ts",
            classification: 123,
          },
        ],
      }),
    ).toThrow('entries[0].classification must be a string for "apps/api/src/routes/a.ts"');
  });

  test("throws on empty entry path", () => {
    expect(() =>
      parsePolicy({
        version: 1,
        thresholds: { coreLogicMaxLines: 240 },
        scope: { include: ["apps/**/*.ts"], exclude: [] },
        entries: [
          {
            path: "",
            classification: "must_split",
          },
        ],
      }),
    ).toThrow("entries[0].path must be a non-empty string");
  });
});

describe("report rendering", () => {
  test("renders markdown and json report outputs", () => {
    const evaluation = evaluateModularityPolicy({
      policy: createPolicy(),
      fileLines: {
        "apps/api/src/newLargeModule.ts": 241,
      },
    });

    const markdown = renderMarkdownReport(evaluation);
    const json = renderJsonReport(evaluation);

    expect(markdown).toContain("## Modularity Policy Report");
    expect(markdown).toContain("| Path | LOC | Baseline | Delta | Classification | Result | Reason |");
    expect(markdown).toContain("apps/api/src/newLargeModule.ts");
    expect(json).toContain("\"violations\"");
    expect(json).toContain("\"missing_classification_for_oversized\"");
  });
});
