const DEFAULT_SCAN_TARGETS = ["apps", "packages", "convex"] as const;
const OPEN_GREP_CONFIG_PATH = "opengrep.yml";
const OPEN_GREP_RELEASES_URL = "https://github.com/opengrep/opengrep/releases";
const KNOWN_NOISE_PATTERN =
  /^.*RequestsDependencyWarning: Unable to find acceptable character detection dependency \(chardet or charset_normalizer\)\.\r?\n?/gim;
const DISALLOWED_OUTPUT_ARGS = new Set([
  "--emacs",
  "--gitlab-sast",
  "--gitlab-secrets",
  "--json",
  "--json-output",
  "--junit-xml",
  "--junit-xml-output",
  "--output",
  "--sarif",
  "--sarif-output",
  "--text",
  "--text-output",
  "--vim",
  "--vim-output",
  "-o",
]);
const OPEN_GREP_FLAGS_WITH_VALUES = new Set([
  "--baseline-commit",
  "--diff-depth",
  "-e",
  "--pattern",
  "--dynamic-timeout-max-multiplier",
  "--dynamic-timeout-unit-kb",
  "--exclude",
  "--exclude-rule",
  "-f",
  "-c",
  "--config",
  "--emacs-output",
  "--gitlab-sast-output",
  "--gitlab-secrets-output",
  "--include",
  "-j",
  "--jobs",
  "--json-output",
  "--junit-xml-output",
  "-l",
  "--lang",
  "--max-chars-per-line",
  "--max-lines-per-finding",
  "--max-log-list-entries",
  "--max-match-per-file",
  "--max-memory",
  "--max-target-bytes",
  "-o",
  "--output",
  "--opengrep-ignore-pattern",
  "--optimizations",
  "--project-root",
  "--remote",
  "--replacement",
  "--sarif-output",
  "--semgrepignore-filename",
  "--severity",
  "--text-output",
  "--timeout",
  "--timeout-threshold",
  "--vim-output",
]);

type OutputChannel = "stdout" | "stderr";
type OpenGrepSeverity = "ERROR" | "WARNING" | "INFO";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type RunCommandLike = (
  args: string[],
  options?: {
    cwd?: string;
  },
) => Promise<CommandResult>;

export interface OutputWriter {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

type OpenGrepFinding = {
  check_id: string;
  path: string;
  start?: {
    line: number;
    col: number;
  };
  extra: {
    message: string;
    severity: OpenGrepSeverity;
    lines?: string;
  };
};

type OpenGrepReport = {
  results: OpenGrepFinding[];
  errors: Array<{
    message: string;
    level?: string;
    rule_id?: string;
  }>;
  paths?: {
    scanned?: string[];
  };
};

type ParsedCliArgs =
  | {
    mode: "passthrough";
    args: string[];
  }
  | {
    mode: "validate";
  }
  | {
    mode: "scan";
    scanArgs: string[];
    targetMode: "default" | "explicit" | "changed" | "staged";
  };

type SplitScanArgsResult = {
  explicitTargets: string[];
  forwardedFlagTokens: string[];
};

const defaultWriter: OutputWriter = {
  stdout: (chunk) => {
    process.stdout.write(chunk);
  },
  stderr: (chunk) => {
    process.stderr.write(chunk);
  },
};

const OPEN_GREP_INSTALL_MESSAGE =
  "OpenGrep is not installed or is not available on PATH. Install it from " +
  `${OPEN_GREP_RELEASES_URL} and verify the \`opengrep\` binary is reachable from your shell.`;

export class OpenGrepCommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = "OpenGrepCommandError";
  }
}

class OpenGrepUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenGrepUsageError";
  }
}

const defaultRunCommand: RunCommandLike = async (args, options = {}) => {
  const spawned = Bun.spawn(args, {
    cwd: options.cwd ?? process.cwd(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(spawned.stdout).text(),
    new Response(spawned.stderr).text(),
    spawned.exited,
  ]);

  return {
    exitCode,
    stdout,
    stderr,
  };
};

const normalizePath = (value: string): string => value.replaceAll("\\", "/");

const isRelevantRepoPath = (value: string): boolean =>
  DEFAULT_SCAN_TARGETS.some((prefix) => normalizePath(value).startsWith(`${prefix}/`));

const splitLines = (value: string): string[] =>
  value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const emitOutput = (
  writer: OutputWriter,
  channel: OutputChannel,
  content: string,
): void => {
  if (content.length === 0) {
    return;
  }

  writer[channel](content);
};

export const filterKnownOpenGrepNoise = (content: string): string =>
  content.replace(KNOWN_NOISE_PATTERN, "");

const emitFilteredOutput = (
  writer: OutputWriter,
  channel: OutputChannel,
  content: string,
): void => {
  emitOutput(writer, channel, filterKnownOpenGrepNoise(content));
};

const splitScanArgs = (args: string[]): SplitScanArgsResult => {
  const explicitTargets: string[] = [];
  const forwardedFlagTokens: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--") {
      explicitTargets.push(...args.slice(index + 1));
      break;
    }

    if (token.startsWith("--") && token.includes("=")) {
      forwardedFlagTokens.push(token);
      continue;
    }

    if (token.startsWith("-")) {
      forwardedFlagTokens.push(token);

      if (OPEN_GREP_FLAGS_WITH_VALUES.has(token) && index + 1 < args.length) {
        index += 1;
        forwardedFlagTokens.push(args[index]);
      }

      continue;
    }

    explicitTargets.push(token);
  }

  return {
    explicitTargets,
    forwardedFlagTokens,
  };
};

const parseCliArgs = (userArgs: string[]): ParsedCliArgs => {
  if (userArgs.length === 1 && (userArgs[0] === "--help" || userArgs[0] === "-h" || userArgs[0] === "--version")) {
    return {
      mode: "passthrough",
      args: userArgs,
    };
  }

  const hasValidate = userArgs.includes("--validate");
  const hasChanged = userArgs.includes("--changed");
  const hasStaged = userArgs.includes("--staged");

  if ([hasValidate, hasChanged, hasStaged].filter(Boolean).length > 1) {
    throw new OpenGrepUsageError("Use at most one of --validate, --changed, or --staged");
  }

  if (hasValidate) {
    if (userArgs.length !== 1) {
      throw new OpenGrepUsageError("--validate cannot be combined with scan targets or other wrapper flags");
    }

    return {
      mode: "validate",
    };
  }

  if (hasChanged || hasStaged) {
    const scanArgs = userArgs.filter((arg) => arg !== "--changed" && arg !== "--staged");
    const { explicitTargets } = splitScanArgs(scanArgs);

    if (explicitTargets.length > 0) {
      throw new OpenGrepUsageError("Pass only OpenGrep flags with --changed or --staged, not explicit targets");
    }

    return {
      mode: "scan",
      scanArgs,
      targetMode: hasChanged ? "changed" : "staged",
    };
  }

  return {
    mode: "scan",
    scanArgs: userArgs,
    targetMode: splitScanArgs(userArgs).explicitTargets.length > 0 ? "explicit" : "default",
  };
};

const assertAllowedScanArgs = (args: string[]): void => {
  for (const arg of args) {
    const isDisallowedLongForm = arg.startsWith("--") && [...DISALLOWED_OUTPUT_ARGS].some((blockedArg) =>
      blockedArg.startsWith("--") && arg.startsWith(`${blockedArg}=`));

    if (DISALLOWED_OUTPUT_ARGS.has(arg) || isDisallowedLongForm) {
      throw new OpenGrepUsageError(
        `The wrapper manages output formatting itself. Remove the unsupported flag: ${arg}`,
      );
    }
  }
};

export const resolveOpenGrepArgs = (userArgs: string[]): string[] => {
  const { explicitTargets, forwardedFlagTokens } = splitScanArgs(userArgs);
  assertAllowedScanArgs(forwardedFlagTokens);

  return [
    "scan",
    "--config",
    OPEN_GREP_CONFIG_PATH,
    "--json",
    ...(explicitTargets.length > 0 ? userArgs : [...forwardedFlagTokens, ...DEFAULT_SCAN_TARGETS]),
  ];
};

const parseOpenGrepReport = (stdout: string): OpenGrepReport => {
  const trimmed = stdout.trim();

  if (trimmed.length === 0) {
    throw new OpenGrepCommandError("OpenGrep did not produce JSON output", 1);
  }

  try {
    return JSON.parse(trimmed) as OpenGrepReport;
  } catch (error) {
    throw new OpenGrepCommandError(
      `Failed to parse OpenGrep JSON output: ${error instanceof Error ? error.message : String(error)}`,
      1,
    );
  }
};

const formatFinding = (finding: OpenGrepFinding): string => {
  const location = finding.start
    ? `${normalizePath(finding.path)}:${finding.start.line}:${finding.start.col}`
    : normalizePath(finding.path);
  const snippet = finding.extra.lines?.trim();

  return [
    `${finding.extra.severity} ${location} ${finding.check_id}`,
    `  ${finding.extra.message}`,
    ...(snippet ? [`  ${snippet}`] : []),
  ].join("\n");
};

const emitFindings = (
  report: OpenGrepReport,
  writer: OutputWriter,
): void => {
  if (report.results.length === 0) {
    return;
  }

  const severityOrder: Record<OpenGrepSeverity, number> = {
    ERROR: 0,
    WARNING: 1,
    INFO: 2,
  };

  const lines = [...report.results]
    .sort((left, right) => {
      const severityDelta = severityOrder[left.extra.severity] - severityOrder[right.extra.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      const pathDelta = normalizePath(left.path).localeCompare(normalizePath(right.path));
      if (pathDelta !== 0) {
        return pathDelta;
      }

      return (left.start?.line ?? 0) - (right.start?.line ?? 0);
    })
    .map(formatFinding)
    .join("\n\n");

  emitOutput(writer, "stdout", `${lines}\n`);
};

const emitReportErrors = (
  report: OpenGrepReport,
  writer: OutputWriter,
): void => {
  if (report.errors.length === 0) {
    return;
  }

  const formatted = report.errors
    .map((error) => {
      const rulePrefix = error.rule_id ? `${error.rule_id}: ` : "";
      return `${rulePrefix}${error.message}`;
    })
    .join("\n");

  emitOutput(writer, "stderr", `${formatted}\n`);
};

const getBlockingFindingCount = (report: OpenGrepReport): number =>
  report.results.filter((finding) => finding.extra.severity === "ERROR").length;

const getGitPaths = async (
  args: string[],
  runCommand: RunCommandLike,
  writer: OutputWriter,
): Promise<string[]> => {
  const result = await runCommand(["git", ...args]);
  if (result.exitCode !== 0) {
    emitOutput(writer, "stderr", result.stderr);
    throw new OpenGrepCommandError(`Failed to resolve git paths: git ${args.join(" ")}`, result.exitCode);
  }

  return splitLines(result.stdout)
    .map(normalizePath)
    .filter(isRelevantRepoPath);
};

const resolveChangedTargets = async (
  runCommand: RunCommandLike,
  writer: OutputWriter,
): Promise<string[]> => {
  const [unstaged, staged, untracked] = await Promise.all([
    getGitPaths(["diff", "--name-only", "--diff-filter=ACMR"], runCommand, writer),
    getGitPaths(["diff", "--cached", "--name-only", "--diff-filter=ACMR"], runCommand, writer),
    getGitPaths(["ls-files", "--others", "--exclude-standard"], runCommand, writer),
  ]);

  return [...new Set([...unstaged, ...staged, ...untracked])];
};

const resolveStagedTargets = async (
  runCommand: RunCommandLike,
  writer: OutputWriter,
): Promise<string[]> => {
  const staged = await getGitPaths(["diff", "--cached", "--name-only", "--diff-filter=ACMR"], runCommand, writer);
  return [...new Set(staged)];
};

export const assertOpenGrepInstalled = async (
  runCommand: RunCommandLike = defaultRunCommand,
): Promise<void> => {
  try {
    const result = await runCommand(["opengrep", "--version"]);

    if (result.exitCode !== 0) {
      throw new Error(OPEN_GREP_INSTALL_MESSAGE);
    }
  } catch (error) {
    if (error instanceof Error && error.message === OPEN_GREP_INSTALL_MESSAGE) {
      throw error;
    }

    throw new Error(OPEN_GREP_INSTALL_MESSAGE);
  }
};

const validateOpenGrepConfig = async (
  runCommand: RunCommandLike,
  writer: OutputWriter,
): Promise<void> => {
  const result = await runCommand(["opengrep", "validate", OPEN_GREP_CONFIG_PATH]);

  emitFilteredOutput(writer, "stdout", result.stdout);
  emitFilteredOutput(writer, "stderr", result.stderr);

  if (result.exitCode !== 0) {
    throw new OpenGrepCommandError("OpenGrep config validation failed", result.exitCode);
  }
};

const runOpenGrepPassthrough = async (
  args: string[],
  runCommand: RunCommandLike,
  writer: OutputWriter,
): Promise<void> => {
  const result = await runCommand(["opengrep", ...args]);

  emitFilteredOutput(writer, "stdout", result.stdout);
  emitFilteredOutput(writer, "stderr", result.stderr);

  if (result.exitCode !== 0) {
    throw new OpenGrepCommandError(`OpenGrep exited with code ${result.exitCode}`, result.exitCode);
  }
};

export const runOpenGrepCli = async (
  userArgs: string[],
  runCommand: RunCommandLike = defaultRunCommand,
  writer: OutputWriter = defaultWriter,
): Promise<void> => {
  const parsedArgs = parseCliArgs(userArgs);
  await assertOpenGrepInstalled(runCommand);

  if (parsedArgs.mode === "passthrough") {
    await runOpenGrepPassthrough(parsedArgs.args, runCommand, writer);
    return;
  }

  if (parsedArgs.mode === "validate") {
    await validateOpenGrepConfig(runCommand, writer);
    return;
  }

  const targets =
    parsedArgs.targetMode === "changed"
      ? await resolveChangedTargets(runCommand, writer)
      : parsedArgs.targetMode === "staged"
        ? await resolveStagedTargets(runCommand, writer)
        : null;

  if (targets && targets.length === 0) {
    emitOutput(writer, "stdout", "No relevant changed files for OpenGrep.\n");
    return;
  }

  await validateOpenGrepConfig(runCommand, writer);

  const scanArgs = targets ? [...parsedArgs.scanArgs, ...targets] : parsedArgs.scanArgs;
  const result = await runCommand(["opengrep", ...resolveOpenGrepArgs(scanArgs)]);

  emitFilteredOutput(writer, "stderr", result.stderr);

  if (result.exitCode !== 0) {
    throw new OpenGrepCommandError(`OpenGrep scan failed with exit code ${result.exitCode}`, result.exitCode);
  }

  const report = parseOpenGrepReport(result.stdout);
  emitReportErrors(report, writer);
  emitFindings(report, writer);

  if (report.errors.length > 0) {
    throw new OpenGrepCommandError("OpenGrep scan reported engine errors", 1);
  }

  const blockingFindingCount = getBlockingFindingCount(report);
  if (blockingFindingCount > 0) {
    throw new OpenGrepCommandError(
      `OpenGrep found ${blockingFindingCount} error-level finding${blockingFindingCount === 1 ? "" : "s"}`,
      1,
    );
  }
};

export const handleOpenGrepCliError = (
  error: OpenGrepCommandError,
  writer: OutputWriter = defaultWriter,
): number => {
  emitOutput(writer, "stderr", `${error.message}\n`);
  return error.exitCode;
};

const main = async (): Promise<void> => {
  try {
    await runOpenGrepCli(Bun.argv.slice(2));
  } catch (error) {
    if (error instanceof OpenGrepCommandError) {
      process.exitCode = handleOpenGrepCliError(error, defaultWriter);
      return;
    }

    if (error instanceof OpenGrepUsageError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

if (import.meta.main) {
  await main();
}

export { OPEN_GREP_CONFIG_PATH, OPEN_GREP_INSTALL_MESSAGE, OPEN_GREP_RELEASES_URL };
