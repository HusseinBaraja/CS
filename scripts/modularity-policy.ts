import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const VALID_CLASSIFICATIONS = [
  "must_split",
  "cohesive_exception",
  "excluded_non_core",
] as const;

export type ModularityClassification = (typeof VALID_CLASSIFICATIONS)[number];

export type ModularityPolicyEntry = {
  path: string;
  classification: ModularityClassification | string;
  maxLines?: number;
  reason: string;
};

export type ModularityPolicy = {
  version: number;
  thresholds: {
    coreLogicMaxLines: number;
  };
  scope: {
    include: string[];
    exclude: string[];
  };
  entries: ModularityPolicyEntry[];
};

export type ModularityViolation = {
  code:
    | "allowlist_entry_below_threshold"
    | "duplicate_policy_entry"
    | "excluded_entry_missing_reason"
    | "invalid_policy_entry"
    | "missing_classification_for_oversized"
    | "oversized_file_exceeds_max_lines"
    | "policy_entry_missing_file";
  path: string;
  message: string;
};

export type ModularityResultRow = {
  path: string;
  loc: number | null;
  baseline: number | null;
  delta: number | null;
  classification: string;
  result: "pass" | "fail";
  reason: string;
};

export type ModularityEvaluation = {
  threshold: number;
  inScopeFileCount: number;
  oversizedInScopeFileCount: number;
  policyEntryCount: number;
  countsByClassification: Record<ModularityClassification, number>;
  sections: {
    belowThresholdAllowlisted: string[];
    exceededBaseline: string[];
    invalidPolicyEntries: string[];
    missingClassification: string[];
    stalePolicyEntries: string[];
  };
  rows: ModularityResultRow[];
  violations: ModularityViolation[];
};

type ParsedOptions = {
  format: "plain" | "json" | "markdown";
  policyPath: string;
};

const DEFAULT_POLICY_PATH = "modularity-policy.json";
const GLOB_CACHE = new Map<string, RegExp>();
const IGNORED_WALK_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  "out",
  ".vercel",
]);

export const normalizeRepoPath = (value: string): string =>
  value.replaceAll("\\", "/").replace(/^\.\/+/u, "").replace(/\/+/gu, "/");

export const countLinesFromText = (text: string): number => {
  if (text.length === 0) {
    return 0;
  }

  const normalized = text.replaceAll("\r\n", "\n");
  const rows = normalized.split("\n");
  if (rows[rows.length - 1] === "") {
    rows.pop();
  }

  return rows.length;
};

const escapeRegex = (value: string): string => value.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");

export const globToRegExp = (pattern: string): RegExp => {
  const normalizedPattern = normalizeRepoPath(pattern);
  const cached = GLOB_CACHE.get(normalizedPattern);
  if (cached) {
    return cached;
  }

  let regex = "^";
  let index = 0;
  while (index < normalizedPattern.length) {
    const char = normalizedPattern[index];
    const nextChar = normalizedPattern[index + 1];

    if (char === "*" && nextChar === "*") {
      if (normalizedPattern[index + 2] === "/") {
        regex += "(?:.*/)?";
        index += 3;
        continue;
      }

      regex += ".*";
      index += 2;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      index += 1;
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      index += 1;
      continue;
    }

    regex += escapeRegex(char);
    index += 1;
  }

  regex += "$";
  const compiled = new RegExp(regex, "u");
  GLOB_CACHE.set(normalizedPattern, compiled);
  return compiled;
};

export const matchesGlob = (path: string, pattern: string): boolean =>
  globToRegExp(pattern).test(normalizeRepoPath(path));

export const isPathInScope = (path: string, policy: Pick<ModularityPolicy, "scope">): boolean => {
  const normalizedPath = normalizeRepoPath(path);
  const included = policy.scope.include.some((pattern) => matchesGlob(normalizedPath, pattern));
  if (!included) {
    return false;
  }

  return !policy.scope.exclude.some((pattern) => matchesGlob(normalizedPath, pattern));
};

const isValidClassification = (value: string): value is ModularityClassification =>
  VALID_CLASSIFICATIONS.includes(value as ModularityClassification);

const isAllowlistedClassification = (classification: string): boolean =>
  classification === "must_split" || classification === "cohesive_exception";

const toSortedUnique = (values: Iterable<string>): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));

const addViolation = (
  violations: ModularityViolation[],
  code: ModularityViolation["code"],
  path: string,
  message: string,
): void => {
  violations.push({ code, path, message });
};

const findEntryViolations = (path: string, violations: readonly ModularityViolation[]): string[] =>
  violations
    .filter((violation) => normalizeRepoPath(violation.path) === normalizeRepoPath(path))
    .map((violation) => violation.message);

export const evaluateModularityPolicy = (input: {
  policy: ModularityPolicy;
  fileLines: Record<string, number>;
}): ModularityEvaluation => {
  const threshold = input.policy.thresholds.coreLogicMaxLines;
  const normalizedFileLines = Object.fromEntries(
    Object.entries(input.fileLines).map(([path, lines]) => [normalizeRepoPath(path), lines]),
  );
  const filePaths = Object.keys(normalizedFileLines);

  const inScopeFiles = filePaths.filter((path) => isPathInScope(path, input.policy));
  const oversizedInScopeFiles = inScopeFiles.filter((path) => normalizedFileLines[path] > threshold);

  const countsByClassification: Record<ModularityClassification, number> = {
    must_split: 0,
    cohesive_exception: 0,
    excluded_non_core: 0,
  };

  const violations: ModularityViolation[] = [];
  const entryByPath = new Map<string, ModularityPolicyEntry>();
  const normalizedEntries = input.policy.entries.map((entry) => ({
    ...entry,
    path: normalizeRepoPath(entry.path),
    reason: entry.reason ?? "",
  }));

  for (const entry of normalizedEntries) {
    if (!entry.path) {
      addViolation(
        violations,
        "invalid_policy_entry",
        entry.path,
        "Policy entry path must be non-empty.",
      );
      continue;
    }

    if (entryByPath.has(entry.path)) {
      addViolation(
        violations,
        "duplicate_policy_entry",
        entry.path,
        "Policy has duplicate entries for the same path.",
      );
      continue;
    }

    entryByPath.set(entry.path, entry);

    if (!isValidClassification(entry.classification)) {
      addViolation(
        violations,
        "invalid_policy_entry",
        entry.path,
        `Invalid classification "${entry.classification}".`,
      );
    } else {
      countsByClassification[entry.classification] += 1;
    }

    if (entry.classification === "excluded_non_core" && entry.reason.trim().length === 0) {
      addViolation(
        violations,
        "excluded_entry_missing_reason",
        entry.path,
        "excluded_non_core entries must include a non-empty reason.",
      );
    }

    if (
      isAllowlistedClassification(entry.classification) &&
      (!Number.isInteger(entry.maxLines) || (entry.maxLines ?? 0) < threshold)
    ) {
      addViolation(
        violations,
        "invalid_policy_entry",
        entry.path,
        `Allowlisted entries must include an integer maxLines >= ${threshold}.`,
      );
    }

    if (!Object.prototype.hasOwnProperty.call(normalizedFileLines, entry.path)) {
      addViolation(
        violations,
        "policy_entry_missing_file",
        entry.path,
        "Policy entry points to a file that does not exist.",
      );
      continue;
    }

    const lineCount = normalizedFileLines[entry.path];
    if (
      isAllowlistedClassification(entry.classification) &&
      isPathInScope(entry.path, input.policy) &&
      lineCount <= threshold
    ) {
      addViolation(
        violations,
        "allowlist_entry_below_threshold",
        entry.path,
        "File is now at or below threshold and should be removed from the oversized allowlist.",
      );
    }
  }

  const missingClassificationRows: ModularityResultRow[] = [];
  for (const path of oversizedInScopeFiles) {
    const entry = entryByPath.get(path);
    if (!entry) {
      addViolation(
        violations,
        "missing_classification_for_oversized",
        path,
        `Oversized file (${normalizedFileLines[path]} LOC) is missing a policy classification.`,
      );
      missingClassificationRows.push({
        path,
        loc: normalizedFileLines[path],
        baseline: null,
        delta: null,
        classification: "unclassified",
        result: "fail",
        reason: "Oversized file is missing a policy entry.",
      });
      continue;
    }

    if (!isValidClassification(entry.classification)) {
      continue;
    }

    if (entry.classification === "excluded_non_core") {
      continue;
    }

    const baseline = entry.maxLines ?? 0;
    if (normalizedFileLines[path] > baseline) {
      addViolation(
        violations,
        "oversized_file_exceeds_max_lines",
        path,
        `File grew beyond allowed baseline (${normalizedFileLines[path]} > ${baseline}).`,
      );
    }
  }

  const policyRows = normalizedEntries.map((entry): ModularityResultRow => {
    const lineCount = Object.prototype.hasOwnProperty.call(normalizedFileLines, entry.path)
      ? normalizedFileLines[entry.path]
      : null;
    const baseline = isAllowlistedClassification(entry.classification) ? entry.maxLines ?? null : null;
    const delta = lineCount !== null && baseline !== null ? lineCount - baseline : null;
    const rowViolations = findEntryViolations(entry.path, violations);
    return {
      path: entry.path,
      loc: lineCount,
      baseline,
      delta,
      classification: entry.classification,
      result: rowViolations.length > 0 ? "fail" : "pass",
      reason: rowViolations.length > 0 ? rowViolations.join("; ") : entry.reason,
    };
  });

  const rows = [...policyRows, ...missingClassificationRows].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

  return {
    threshold,
    inScopeFileCount: inScopeFiles.length,
    oversizedInScopeFileCount: oversizedInScopeFiles.length,
    policyEntryCount: normalizedEntries.length,
    countsByClassification,
    sections: {
      belowThresholdAllowlisted: toSortedUnique(
        violations
          .filter((violation) => violation.code === "allowlist_entry_below_threshold")
          .map((violation) => violation.path),
      ),
      exceededBaseline: toSortedUnique(
        violations
          .filter((violation) => violation.code === "oversized_file_exceeds_max_lines")
          .map((violation) => violation.path),
      ),
      invalidPolicyEntries: toSortedUnique(
        violations
          .filter(
            (violation) =>
              violation.code === "invalid_policy_entry" || violation.code === "excluded_entry_missing_reason",
          )
          .map((violation) => violation.path),
      ),
      missingClassification: toSortedUnique(
        violations
          .filter((violation) => violation.code === "missing_classification_for_oversized")
          .map((violation) => violation.path),
      ),
      stalePolicyEntries: toSortedUnique(
        violations
          .filter((violation) => violation.code === "policy_entry_missing_file")
          .map((violation) => violation.path),
      ),
    },
    rows,
    violations,
  };
};

const formatCell = (value: number | null | string): string => {
  if (value === null) {
    return "-";
  }

  return String(value);
};

const renderList = (title: string, values: readonly string[]): string[] => {
  if (values.length === 0) {
    return [`### ${title}`, "- none"];
  }

  return [`### ${title}`, ...values.map((value) => `- ${value}`)];
};

export const renderMarkdownReport = (evaluation: ModularityEvaluation): string => {
  const lines: string[] = [
    "## Modularity Policy Report",
    `- Threshold: ${evaluation.threshold} LOC`,
    `- In-scope files: ${evaluation.inScopeFileCount}`,
    `- Oversized in-scope files: ${evaluation.oversizedInScopeFileCount}`,
    `- Policy entries: ${evaluation.policyEntryCount}`,
    `- Violations: ${evaluation.violations.length}`,
    "",
    "### Counts By Classification",
    "| Classification | Count |",
    "| --- | ---: |",
    `| must_split | ${evaluation.countsByClassification.must_split} |`,
    `| cohesive_exception | ${evaluation.countsByClassification.cohesive_exception} |`,
    `| excluded_non_core | ${evaluation.countsByClassification.excluded_non_core} |`,
    "",
    ...renderList("Newly Failing Files (Missing Classification)", evaluation.sections.missingClassification),
    "",
    ...renderList("Oversized Files Exceeding Baseline", evaluation.sections.exceededBaseline),
    "",
    ...renderList(
      "Oversized Allowlist Entries Now At/Below Threshold",
      evaluation.sections.belowThresholdAllowlisted,
    ),
    "",
    ...renderList("Stale Policy Entries (Missing Files)", evaluation.sections.stalePolicyEntries),
    "",
    ...renderList("Invalid Policy Entries", evaluation.sections.invalidPolicyEntries),
    "",
    "### Detailed Results",
    "| Path | LOC | Baseline | Delta | Classification | Result | Reason |",
    "| --- | ---: | ---: | ---: | --- | --- | --- |",
  ];

  for (const row of evaluation.rows) {
    lines.push(
      `| ${row.path} | ${formatCell(row.loc)} | ${formatCell(row.baseline)} | ${formatCell(row.delta)} | ${row.classification} | ${row.result} | ${row.reason} |`,
    );
  }

  return lines.join("\n");
};

export const renderPlainReport = (evaluation: ModularityEvaluation): string => {
  const lines = [
    "Modularity policy check",
    `threshold: ${evaluation.threshold}`,
    `in_scope_files: ${evaluation.inScopeFileCount}`,
    `oversized_in_scope_files: ${evaluation.oversizedInScopeFileCount}`,
    `policy_entries: ${evaluation.policyEntryCount}`,
    `violations: ${evaluation.violations.length}`,
    "",
    `missing_classification: ${evaluation.sections.missingClassification.length}`,
    `exceeded_baseline: ${evaluation.sections.exceededBaseline.length}`,
    `allowlist_below_threshold: ${evaluation.sections.belowThresholdAllowlisted.length}`,
    `stale_policy_entries: ${evaluation.sections.stalePolicyEntries.length}`,
    `invalid_policy_entries: ${evaluation.sections.invalidPolicyEntries.length}`,
  ];

  if (evaluation.violations.length > 0) {
    lines.push("", "violations:");
    for (const violation of evaluation.violations) {
      lines.push(`- [${violation.code}] ${violation.path}: ${violation.message}`);
    }
  }

  return lines.join("\n");
};

export const renderJsonReport = (evaluation: ModularityEvaluation): string =>
  JSON.stringify(evaluation, null, 2);

export const parsePolicy = (raw: unknown): ModularityPolicy => {
  if (!raw || typeof raw !== "object") {
    throw new Error("modularity-policy.json must contain an object.");
  }

  const candidate = raw as Record<string, unknown>;
  const thresholds = candidate.thresholds as Record<string, unknown> | undefined;
  const scope = candidate.scope as Record<string, unknown> | undefined;
  const entries = candidate.entries;
  const version = candidate.version;

  if (typeof version !== "number") {
    throw new Error("modularity-policy.json version must be a number.");
  }

  if (!thresholds || typeof thresholds.coreLogicMaxLines !== "number") {
    throw new Error("modularity-policy.json thresholds.coreLogicMaxLines must be a number.");
  }

  if (!scope || !Array.isArray(scope.include) || !Array.isArray(scope.exclude)) {
    throw new Error("modularity-policy.json scope.include and scope.exclude must be arrays.");
  }

  if (!Array.isArray(entries)) {
    throw new Error("modularity-policy.json entries must be an array.");
  }

  return {
    version,
    thresholds: {
      coreLogicMaxLines: thresholds.coreLogicMaxLines,
    },
    scope: {
      include: scope.include.map((value) => String(value)),
      exclude: scope.exclude.map((value) => String(value)),
    },
    entries: entries.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`modularity-policy.json entries[${index}] must be an object.`);
      }

      const normalizedEntry = entry as Record<string, unknown>;
      if (typeof normalizedEntry.path !== "string" || normalizedEntry.path.trim().length === 0) {
        throw new Error(`modularity-policy.json entries[${index}].path must be a non-empty string.`);
      }

      if (typeof normalizedEntry.classification !== "string") {
        throw new Error(
          `modularity-policy.json entries[${index}].classification must be a string for "${normalizedEntry.path}".`,
        );
      }

      if (
        typeof normalizedEntry.maxLines !== "undefined" &&
        typeof normalizedEntry.maxLines !== "number"
      ) {
        throw new Error(
          `modularity-policy.json entries[${index}].maxLines must be a number for "${normalizedEntry.path}".`,
        );
      }

      if (typeof normalizedEntry.reason !== "undefined" && typeof normalizedEntry.reason !== "string") {
        throw new Error(
          `modularity-policy.json entries[${index}].reason must be a string for "${normalizedEntry.path}".`,
        );
      }

      return {
        path: normalizedEntry.path,
        classification: normalizedEntry.classification,
        maxLines:
          typeof normalizedEntry.maxLines === "number" ? normalizedEntry.maxLines : undefined,
        reason: typeof normalizedEntry.reason === "string" ? normalizedEntry.reason : "",
      };
    }),
  };
};

const deriveIncludeRoots = (includePatterns: readonly string[]): string[] => {
  const roots = new Set<string>();
  for (const pattern of includePatterns) {
    const normalizedPattern = normalizeRepoPath(pattern);
    const [firstSegment] = normalizedPattern.split("/");
    if (!firstSegment || firstSegment.includes("*") || firstSegment.includes("?")) {
      roots.add(".");
      continue;
    }

    roots.add(firstSegment);
  }

  return [...roots];
};

const walkTypeScriptFiles = (rootDirectory: string, relativeDirectory: string): string[] => {
  const absoluteDirectory = resolve(rootDirectory, relativeDirectory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = normalizeRepoPath(
      relativeDirectory === "." ? entry.name : `${relativeDirectory}/${entry.name}`,
    );

    if (entry.isDirectory()) {
      if (IGNORED_WALK_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...walkTypeScriptFiles(rootDirectory, relativePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(relativePath);
    }
  }

  return files;
};

const collectFileLines = (rootDirectory: string, includePatterns: readonly string[]): Record<string, number> => {
  const includeRoots = deriveIncludeRoots(includePatterns);
  const files = toSortedUnique(
    includeRoots.flatMap((includeRoot) => walkTypeScriptFiles(rootDirectory, includeRoot)),
  );

  return Object.fromEntries(
    files.map((path) => {
      const text = readFileSync(resolve(rootDirectory, path), "utf8");
      return [path, countLinesFromText(text)];
    }),
  );
};

const parseArgs = (args: readonly string[]): ParsedOptions => {
  let format: ParsedOptions["format"] = "plain";
  let policyPath = DEFAULT_POLICY_PATH;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--json") {
      if (format !== "plain") {
        throw new Error("Only one output format can be selected.");
      }
      format = "json";
      continue;
    }

    if (argument === "--markdown") {
      if (format !== "plain") {
        throw new Error("Only one output format can be selected.");
      }
      format = "markdown";
      continue;
    }

    if (argument === "--policy") {
      const nextArgument = args[index + 1];
      if (!nextArgument) {
        throw new Error("Expected a path after --policy.");
      }

      policyPath = nextArgument;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument "${argument}". Supported: --json, --markdown, --policy <path>.`);
  }

  return {
    format,
    policyPath,
  };
};

const main = async (): Promise<void> => {
  try {
    const options = parseArgs(Bun.argv.slice(2));
    const policyText = await Bun.file(options.policyPath).text();
    const policy = parsePolicy(JSON.parse(policyText));
    const rootDirectory = process.cwd();
    const fileLines = collectFileLines(rootDirectory, policy.scope.include);
    const evaluation = evaluateModularityPolicy({
      policy,
      fileLines,
    });

    if (options.format === "json") {
      console.log(renderJsonReport(evaluation));
    } else if (options.format === "markdown") {
      console.log(renderMarkdownReport(evaluation));
    } else {
      console.log(renderPlainReport(evaluation));
    }

    if (evaluation.violations.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

if (import.meta.main) {
  await main();
}
