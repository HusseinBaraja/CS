import {
  CHAT_PROVIDER_NAMES,
  type ChatProviderAdapter,
  type ChatProviderHealth,
  type ChatProviderName,
  type ChatRuntimeConfig,
  createChatRuntimeConfig,
  getChatProviderAdapter,
} from '@cs/ai';

const CHAT_PROVIDER_NAME_SET = new Set<ChatProviderName>(CHAT_PROVIDER_NAMES);

export class AIProviderCheckArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderCheckArgumentError";
  }
}

export type AdapterResolver = (provider: ChatProviderName) => ChatProviderAdapter;

type ProviderHealthCheckResult =
  | ChatProviderHealth
  | {
    provider: ChatProviderName;
    ok: false;
    errorMessage: string;
  };

export const resolveRequestedProviders = (
  args: string[],
  providerOrder: readonly ChatProviderName[],
): ChatProviderName[] => {
  if (args.length === 0) {
    return [...providerOrder];
  }

  const uniqueProviders: ChatProviderName[] = [];
  const seenProviders = new Set<ChatProviderName>();

  for (const provider of args) {
    if (!CHAT_PROVIDER_NAME_SET.has(provider as ChatProviderName)) {
      throw new AIProviderCheckArgumentError(
        `Unknown AI provider "${provider}". Expected one of: ${CHAT_PROVIDER_NAMES.join(", ")}`,
      );
    }

    const normalizedProvider = provider as ChatProviderName;
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
  resolveAdapter: AdapterResolver = getChatProviderAdapter,
): Promise<ProviderHealthCheckResult[]> =>
  Promise.all(
    providers.map(async (provider) => {
      try {
        const adapter = resolveAdapter(provider);
        return await adapter.healthCheck(runtimeConfig.providers[provider], {
          timeoutMs: runtimeConfig.healthcheckTimeoutMs,
          maxRetries: runtimeConfig.maxRetriesPerProvider,
        });
      } catch (error) {
        return {
          provider,
          ok: false,
          errorMessage: error instanceof Error ? error.message : String(error),
        } satisfies ProviderHealthCheckResult;
      }
    }),
  );

const quoteMessage = (message: string): string =>
  `"${message
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")}"`;

export const formatProviderHealth = (result: ProviderHealthCheckResult): string => {
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

  if (!result.ok && "errorMessage" in result) {
    parts.push(`message=${quoteMessage(result.errorMessage)}`);
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
