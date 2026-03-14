import { describe, expect, test } from 'bun:test';
import {
  assertOpenGrepInstalled,
  type CommandResult,
  filterKnownOpenGrepNoise,
  handleOpenGrepCliError,
  OPEN_GREP_CONFIG_PATH,
  OPEN_GREP_INSTALL_MESSAGE,
  OpenGrepCommandError,
  type OutputWriter,
  resolveOpenGrepArgs,
  type RunCommandLike,
  runOpenGrepCli,
} from './opengrep';

const createRunCommand = (
  implementation: (args: string[]) => CommandResult | Promise<CommandResult>,
): RunCommandLike => async (args) => implementation(args);

const createOutputCapture = (): {
  writer: OutputWriter;
  stdout: () => string;
  stderr: () => string;
} => {
  let stdout = "";
  let stderr = "";

  return {
    writer: {
      stdout: (chunk) => {
        stdout += chunk;
      },
      stderr: (chunk) => {
        stderr += chunk;
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
};

const createScanResult = (
  results: Array<{
    check_id: string;
    path: string;
    start: { line: number; col: number };
    extra: {
      message: string;
      severity: "ERROR" | "WARNING" | "INFO";
      lines?: string;
    };
  }> = [],
  errors: Array<{
    message: string;
    level?: string;
    rule_id?: string;
  }> = [],
) =>
  JSON.stringify({
    version: "1.16.4",
    results,
    errors,
    paths: {
      scanned: [
        "apps/api/src/app.ts",
      ],
    },
    interfile_languages_used: [],
    skipped_rules: [],
  });

const NOISE_LINE =
  "C:\\Users\\Hussein\\AppData\\Local\\opengrep\\V116~1.4\\requests\\__init__.py:86: RequestsDependencyWarning: Unable to find acceptable character detection dependency (chardet or charset_normalizer).\n";

describe("filterKnownOpenGrepNoise", () => {
  test("removes only the known dependency warning lines", () => {
    expect(filterKnownOpenGrepNoise(`${NOISE_LINE}kept\n${NOISE_LINE}`)).toBe("kept\n");
  });
});

describe("resolveOpenGrepArgs", () => {
  test("builds the default repo scan command", () => {
    expect(resolveOpenGrepArgs([])).toEqual([
      "scan",
      "--config",
      OPEN_GREP_CONFIG_PATH,
      "--json",
      "apps",
      "packages",
      "convex",
    ]);
  });

  test("forwards user-supplied targets and flags", () => {
    expect(resolveOpenGrepArgs(["apps/api/src", "--severity", "WARNING"])).toEqual([
      "scan",
      "--config",
      OPEN_GREP_CONFIG_PATH,
      "--json",
      "apps/api/src",
      "--severity",
      "WARNING",
    ]);
  });
});

describe("assertOpenGrepInstalled", () => {
  test("accepts a working OpenGrep binary", async () => {
    await expect(
      assertOpenGrepInstalled(
        createRunCommand((args) => {
          expect(args).toEqual(["opengrep", "--version"]);
          return {
            exitCode: 0,
            stdout: "1.16.4",
            stderr: "",
          };
        }),
      ),
    ).resolves.toBeUndefined();
  });

  test("throws a clear install error when the binary is missing", async () => {
    await expect(
      assertOpenGrepInstalled(
        createRunCommand(() => ({
          exitCode: 1,
          stdout: "",
          stderr: "not found",
        })),
      ),
    ).rejects.toThrow(OPEN_GREP_INSTALL_MESSAGE);
  });
});

describe("runOpenGrepCli", () => {
  test("validates the config before scanning", async () => {
    const invocations: string[][] = [];
    const output = createOutputCapture();

    await expect(
      runOpenGrepCli(
        [],
        createRunCommand((args) => {
          invocations.push(args);

          if (args[1] === "--version") {
            return { exitCode: 0, stdout: "1.16.4", stderr: "" };
          }

          if (args[1] === "validate") {
            return { exitCode: 0, stdout: "", stderr: "" };
          }

          return {
            exitCode: 0,
            stdout: createScanResult(),
            stderr: "",
          };
        }),
        output.writer,
      ),
    ).resolves.toBeUndefined();

    expect(invocations).toEqual([
      ["opengrep", "--version"],
      ["opengrep", "validate", OPEN_GREP_CONFIG_PATH],
      ["opengrep", "scan", "--config", OPEN_GREP_CONFIG_PATH, "--json", "apps", "packages", "convex"],
    ]);
  });

  test("filters the known dependency warning while preserving other stderr output", async () => {
    const output = createOutputCapture();

    await expect(
      runOpenGrepCli(
        ["--validate"],
        createRunCommand((args) => {
          if (args[1] === "--version") {
            return { exitCode: 0, stdout: "1.16.4", stderr: "" };
          }

          return {
            exitCode: 0,
            stdout: "",
            stderr: `${NOISE_LINE}kept stderr\n`,
          };
        }),
        output.writer,
      ),
    ).resolves.toBeUndefined();

    expect(output.stderr()).toBe("kept stderr\n");
  });

  test("stops on invalid config before scanning", async () => {
    const invocations: string[][] = [];
    const output = createOutputCapture();

    await expect(
      runOpenGrepCli(
        [],
        createRunCommand((args) => {
          invocations.push(args);

          if (args[1] === "--version") {
            return { exitCode: 0, stdout: "1.16.4", stderr: "" };
          }

          return {
            exitCode: 1,
            stdout: "",
            stderr: "Configuration is invalid",
          };
        }),
        output.writer,
      ),
    ).rejects.toMatchObject({
      message: "OpenGrep config validation failed",
      exitCode: 1,
    } satisfies Partial<OpenGrepCommandError>);

    expect(invocations).toEqual([
      ["opengrep", "--version"],
      ["opengrep", "validate", OPEN_GREP_CONFIG_PATH],
    ]);
    expect(output.stderr()).toBe("Configuration is invalid");
  });

  test("does not fail on warning-only findings", async () => {
    const output = createOutputCapture();

    await expect(
      runOpenGrepCli(
        [],
        createRunCommand((args) => {
          if (args[1] === "--version") {
            return { exitCode: 0, stdout: "1.16.4", stderr: "" };
          }

          if (args[1] === "validate") {
            return { exitCode: 0, stdout: "", stderr: "" };
          }

          return {
            exitCode: 0,
            stdout: createScanResult([
              {
                check_id: "cs-warning-rule",
                path: "apps/api/src/routes/companies.ts",
                start: { line: 32, col: 21 },
                extra: {
                  message: "Use parseJsonBody(c.req.raw)",
                  severity: "WARNING",
                  lines: "const body = await c.req.json();",
                },
              },
            ]),
            stderr: "",
          };
        }),
        output.writer,
      ),
    ).resolves.toBeUndefined();

    expect(output.stdout()).toContain("WARNING");
    expect(output.stdout()).toContain("cs-warning-rule");
  });

  test("fails on error findings", async () => {
    const output = createOutputCapture();

    await expect(
      runOpenGrepCli(
        [],
        createRunCommand((args) => {
          if (args[1] === "--version") {
            return { exitCode: 0, stdout: "1.16.4", stderr: "" };
          }

          if (args[1] === "validate") {
            return { exitCode: 0, stdout: "", stderr: "" };
          }

          return {
            exitCode: 0,
            stdout: createScanResult([
              {
                check_id: "cs-error-rule",
                path: "apps/api/src/services/convexProductsService.ts",
                start: { line: 12, col: 1 },
                extra: {
                  message: "Use a Convex action instead of a mutation",
                  severity: "ERROR",
                  lines: "client.mutation(convexInternal.products.create, args);",
                },
              },
            ]),
            stderr: "",
          };
        }),
        output.writer,
      ),
    ).rejects.toMatchObject({
      message: "OpenGrep found 1 error-level finding",
      exitCode: 1,
    } satisfies Partial<OpenGrepCommandError>);

    expect(output.stdout()).toContain("ERROR");
    expect(output.stdout()).toContain("cs-error-rule");
  });

  test("resolves changed files and excludes unrelated paths", async () => {
    const invocations: string[][] = [];

    await expect(
      runOpenGrepCli(
        ["--changed"],
        createRunCommand((args) => {
          invocations.push(args);
          const command = args.join(" ");

          switch (command) {
            case "opengrep --version":
              return { exitCode: 0, stdout: "1.16.4", stderr: "" };
            case "git diff --name-only --diff-filter=ACMR":
              return {
                exitCode: 0,
                stdout: "README.md\napps/api/src/app.ts\n",
                stderr: "",
              };
            case "git diff --cached --name-only --diff-filter=ACMR":
              return {
                exitCode: 0,
                stdout: "packages/shared/src/index.ts\n",
                stderr: "",
              };
            case "git ls-files --others --exclude-standard":
              return {
                exitCode: 0,
                stdout: "notes.txt\nconvex/products.ts\n",
                stderr: "",
              };
            case "opengrep validate opengrep.yml":
              return { exitCode: 0, stdout: "", stderr: "" };
            default:
              return {
                exitCode: 0,
                stdout: createScanResult(),
                stderr: "",
              };
          }
        }),
      ),
    ).resolves.toBeUndefined();

    expect(invocations.at(-1)).toEqual([
      "opengrep",
      "scan",
      "--config",
      OPEN_GREP_CONFIG_PATH,
      "--json",
      "apps/api/src/app.ts",
      "packages/shared/src/index.ts",
      "convex/products.ts",
    ]);
  });

  test("resolves staged files only", async () => {
    const invocations: string[][] = [];

    await expect(
      runOpenGrepCli(
        ["--staged"],
        createRunCommand((args) => {
          invocations.push(args);
          const command = args.join(" ");

          switch (command) {
            case "opengrep --version":
              return { exitCode: 0, stdout: "1.16.4", stderr: "" };
            case "git diff --cached --name-only --diff-filter=ACMR":
              return {
                exitCode: 0,
                stdout: "README.md\napps/api/src/routes/products.ts\n",
                stderr: "",
              };
            case "opengrep validate opengrep.yml":
              return { exitCode: 0, stdout: "", stderr: "" };
            default:
              return {
                exitCode: 0,
                stdout: createScanResult(),
                stderr: "",
              };
          }
        }),
      ),
    ).resolves.toBeUndefined();

    expect(invocations.at(-1)).toEqual([
      "opengrep",
      "scan",
      "--config",
      OPEN_GREP_CONFIG_PATH,
      "--json",
      "apps/api/src/routes/products.ts",
    ]);
  });

  test("returns early when no relevant changed files exist", async () => {
    const invocations: string[][] = [];
    const output = createOutputCapture();

    await expect(
      runOpenGrepCli(
        ["--changed"],
        createRunCommand((args) => {
          invocations.push(args);
          const command = args.join(" ");

          switch (command) {
            case "opengrep --version":
              return { exitCode: 0, stdout: "1.16.4", stderr: "" };
            case "git diff --name-only --diff-filter=ACMR":
              return { exitCode: 0, stdout: "README.md\n", stderr: "" };
            case "git diff --cached --name-only --diff-filter=ACMR":
              return { exitCode: 0, stdout: "", stderr: "" };
            case "git ls-files --others --exclude-standard":
              return { exitCode: 0, stdout: "notes.txt\n", stderr: "" };
            default:
              throw new Error(`Unexpected command: ${command}`);
          }
        }),
        output.writer,
      ),
    ).resolves.toBeUndefined();

    expect(output.stdout()).toContain("No relevant changed files");
    expect(invocations).toEqual([
      ["opengrep", "--version"],
      ["git", "diff", "--name-only", "--diff-filter=ACMR"],
      ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
      ["git", "ls-files", "--others", "--exclude-standard"],
    ]);
  });

  test("emits git stderr when resolving changed files fails", async () => {
    const output = createOutputCapture();

    await expect(
      runOpenGrepCli(
        ["--changed"],
        createRunCommand((args) => {
          const command = args.join(" ");

          switch (command) {
            case "opengrep --version":
              return { exitCode: 0, stdout: "1.16.4", stderr: "" };
            case "git diff --name-only --diff-filter=ACMR":
              return {
                exitCode: 128,
                stdout: "",
                stderr: "fatal: not a git repository\n",
              };
            case "git diff --cached --name-only --diff-filter=ACMR":
            case "git ls-files --others --exclude-standard":
              return {
                exitCode: 0,
                stdout: "",
                stderr: "",
              };
            default:
              throw new Error(`Unexpected command: ${command}`);
          }
        }),
        output.writer,
      ),
    ).rejects.toMatchObject({
      message: "Failed to resolve git paths: git diff --name-only --diff-filter=ACMR",
      exitCode: 128,
    } satisfies Partial<OpenGrepCommandError>);

    expect(output.stderr()).toContain("fatal: not a git repository");
  });

  test("emits git stderr when resolving staged files fails", async () => {
    const output = createOutputCapture();

    await expect(
      runOpenGrepCli(
        ["--staged"],
        createRunCommand((args) => {
          const command = args.join(" ");

          switch (command) {
            case "opengrep --version":
              return { exitCode: 0, stdout: "1.16.4", stderr: "" };
            case "git diff --cached --name-only --diff-filter=ACMR":
              return {
                exitCode: 1,
                stdout: "",
                stderr: "git error\n",
              };
            default:
              throw new Error(`Unexpected command: ${command}`);
          }
        }),
        output.writer,
      ),
    ).rejects.toMatchObject({
      message: "Failed to resolve git paths: git diff --cached --name-only --diff-filter=ACMR",
      exitCode: 1,
    } satisfies Partial<OpenGrepCommandError>);

    expect(output.stderr()).toBe("git error\n");
  });
});

describe("handleOpenGrepCliError", () => {
  test("writes the command error message and preserves the exit code", () => {
    const output = createOutputCapture();
    const exitCode = handleOpenGrepCliError(
      new OpenGrepCommandError("OpenGrep scan failed with exit code 2", 2),
      output.writer,
    );

    expect(exitCode).toBe(2);
    expect(output.stderr()).toBe("OpenGrep scan failed with exit code 2\n");
  });
});
