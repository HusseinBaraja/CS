import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';

export const AGENT_ISSUES_DIRECTORY = "agent-issues";
export const AGENT_ISSUES_IMAGE_DIRECTORY = "IMG";

const USAGE_MESSAGE =
  "Expected usage: bun run issue:diagram -- <agent-issues/*.mmd> [output-name]";

const WINDOWS_BROWSER_PATH_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const DEFAULT_RENDER_WIDTH = "2400";
const DEFAULT_RENDER_SCALE = "2";
const DEFAULT_RENDER_BACKGROUND = "white";

export class AgentMermaidArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentMermaidArgumentError";
  }
}

type CliArgs = {
  inputFile: string;
  outputName?: string;
};

export const parseCliArgs = (args: string[]): CliArgs => {
  if (args.length < 1 || args.length > 2) {
    throw new AgentMermaidArgumentError(USAGE_MESSAGE);
  }

  const [inputFile, outputName] = args;

  if (!inputFile || inputFile.trim().length === 0) {
    throw new AgentMermaidArgumentError(USAGE_MESSAGE);
  }

  if (outputName !== undefined && outputName.trim().length === 0) {
    throw new AgentMermaidArgumentError("Output name must not be empty.");
  }

  return {
    inputFile,
    outputName,
  };
};

const isInsideDirectory = (targetPath: string, rootDirectory: string): boolean => {
  const relativePath = relative(rootDirectory, targetPath);
  return relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath);
};

export const resolveIssueMermaidPath = (inputFile: string, cwd: string = process.cwd()): string => {
  if (extname(inputFile).toLowerCase() !== ".mmd") {
    throw new AgentMermaidArgumentError("Input file must use the .mmd extension.");
  }

  const issuePath = resolve(cwd, inputFile);
  const issuesDirectoryPath = resolve(cwd, AGENT_ISSUES_DIRECTORY);

  if (!isInsideDirectory(issuePath, issuesDirectoryPath)) {
    throw new AgentMermaidArgumentError(
      `Input file must be inside "${AGENT_ISSUES_DIRECTORY}" directory.`,
    );
  }

  if (!existsSync(issuePath)) {
    throw new AgentMermaidArgumentError(`Mermaid file does not exist: ${inputFile}`);
  }

  return issuePath;
};

const normalizeOutputName = (inputPath: string, outputName?: string): string => {
  if (!outputName) {
    return `${basename(inputPath, ".mmd")}.png`;
  }

  const trimmedOutputName = outputName.trim();

  if (trimmedOutputName.includes("/") || trimmedOutputName.includes("\\")) {
    throw new AgentMermaidArgumentError("Output name must be a file name, not a path.");
  }

  const outputExtension = extname(trimmedOutputName).toLowerCase();
  if (outputExtension.length > 0 && outputExtension !== ".png") {
    throw new AgentMermaidArgumentError("Output name must use the .png extension.");
  }

  return outputExtension === ".png" ? trimmedOutputName : `${trimmedOutputName}.png`;
};

export const resolveIssuePngPath = (
  inputPath: string,
  outputName?: string,
  cwd: string = process.cwd(),
): string => {
  const outputDirectory = resolve(cwd, AGENT_ISSUES_DIRECTORY, AGENT_ISSUES_IMAGE_DIRECTORY);
  const outputFile = normalizeOutputName(inputPath, outputName);
  return resolve(outputDirectory, outputFile);
};

export const buildMermaidCliCommand = (inputPath: string, outputPath: string): string[] => [
  process.execPath,
  "x",
  "@mermaid-js/mermaid-cli",
  "--input",
  inputPath,
  "--output",
  outputPath,
  "--backgroundColor",
  DEFAULT_RENDER_BACKGROUND,
  "--width",
  DEFAULT_RENDER_WIDTH,
  "--scale",
  DEFAULT_RENDER_SCALE,
];

export const resolvePuppeteerExecutablePath = (
  env: NodeJS.ProcessEnv = process.env,
  pathExists: (path: string) => boolean = existsSync,
): string | undefined => {
  const configuredPath = env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  for (const candidatePath of WINDOWS_BROWSER_PATH_CANDIDATES) {
    if (pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  return undefined;
};

export const buildMermaidCliEnv = (
  env: NodeJS.ProcessEnv = process.env,
  executablePath?: string,
): NodeJS.ProcessEnv => ({
  ...env,
  PUPPETEER_SKIP_DOWNLOAD: env.PUPPETEER_SKIP_DOWNLOAD ?? "true",
  ...(env.PUPPETEER_EXECUTABLE_PATH || !executablePath
    ? {}
    : { PUPPETEER_EXECUTABLE_PATH: executablePath }),
});

const main = async (): Promise<void> => {
  try {
    const { inputFile, outputName } = parseCliArgs(Bun.argv.slice(2));
    const inputPath = resolveIssueMermaidPath(inputFile);
    const outputPath = resolveIssuePngPath(inputPath, outputName);
    const browserExecutablePath = resolvePuppeteerExecutablePath();

    mkdirSync(dirname(outputPath), { recursive: true });

const RENDER_TIMEOUT_MS = 60_000; // 60 seconds

    const processResult = Bun.spawn({
      cmd: buildMermaidCliCommand(inputPath, outputPath),
      env: buildMermaidCliEnv(process.env, browserExecutablePath),
      stdout: "inherit",
      stderr: "inherit",
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Render timed out")), RENDER_TIMEOUT_MS),
    );
    const exitCode = await Promise.race([processResult.exited, timeoutPromise]);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      return;
    }

    console.log(`Generated PNG: ${outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

if (import.meta.main) {
  await main();
}
