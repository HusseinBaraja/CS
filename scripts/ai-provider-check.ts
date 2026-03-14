import {
  type ChatProviderAdapterResolver,
  type ChatProviderHealth,
  type ChatProviderName,
  type ChatRuntimeConfig,
  createChatProviderManager,
  createChatRuntimeConfig,
} from '@cs/ai';

export class AIProviderCheckArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderCheckArgumentError";
  }
}

export type AdapterResolver = ChatProviderAdapterResolver;

export const resolveRequestedProviders = (
  args: string[],
  providerOrder: readonly ChatProviderName[],
): ChatProviderName[] => {
  const allowedProviders = new Set<ChatProviderName>(providerOrder);

  if (args.length === 0) {
    return [...providerOrder];
  }

  const uniqueProviders: ChatProviderName[] = [];
  const seenProviders = new Set<ChatProviderName>();

  for (const provider of args) {
    const normalizedProvider = provider as ChatProviderName;

    if (!allowedProviders.has(normalizedProvider)) {
      throw new AIProviderCheckArgumentError(
        `Unknown AI provider "${provider}". Expected one of: ${providerOrder.join(", ")}`,
      );
    }

    if (!seenProviders.has(normalizedProvider)) {
      seenProviders.add(normalizedProvider);
      uniqueProviders.push(normalizedProvider);
    }
  }

  return uniqueProviders;
};

export const runProviderHealthChecks = async (
  providers: readonly ChatProviderName[],
  runtimeConfig: ChatRuntimeConfig,
  resolveAdapter?: AdapterResolver,
): Promise<ChatProviderHealth[]> =>
  createChatProviderManager({
    runtimeConfig,
    ...(resolveAdapter ? { resolveAdapter } : {}),
  }).probeProviders({ providers });

const quoteMessage = (message: string): string =>
  `"${message
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")}"`;

export const formatProviderHealth = (result: ChatProviderHealth): string => {
  const status = result.ok ? "OK" : "FAIL";
  const parts = [status, result.provider];

  if ("model" in result && typeof result.model === "string") {
    parts.push(`model=${result.model}`);
  }

  if ("latencyMs" in result && typeof result.latencyMs === "number") {
    parts.push(`latencyMs=${result.latencyMs}`);
  }

  if (!result.ok && "error" in result && result.error) {
    parts.push(`errorKind=${result.error.kind}`);
    parts.push(`disposition=${result.error.disposition}`);
    parts.push(`message=${quoteMessage(result.error.message)}`);
    return parts.join(" ");
  }

  return parts.join(" ");
};

const main = async (): Promise<void> => {
  try {
    const runtimeConfig = createChatRuntimeConfig();
    const requestedProviders = resolveRequestedProviders(Bun.argv.slice(2), runtimeConfig.providerOrder);
    const results = await runProviderHealthChecks(requestedProviders, runtimeConfig);

    for (const result of results) {
      console.log(formatProviderHealth(result));
    }

    if (results.some((result) => !result.ok)) {
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
