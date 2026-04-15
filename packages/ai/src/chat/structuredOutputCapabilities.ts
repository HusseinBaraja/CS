import type {
  ChatProviderName,
  ChatResponseFormat,
} from './contracts';

export type ChatResponseFormatCapability =
  | "native_json_schema"
  | "unsupported";

const JSON_SCHEMA_PROVIDER_CAPABILITIES: Record<ChatProviderName, ChatResponseFormatCapability> = {
  deepseek: "unsupported",
  gemini: "native_json_schema",
  groq: "unsupported",
};

export const getChatResponseFormatCapability = (
  provider: ChatProviderName,
  responseFormat: ChatResponseFormat | undefined,
): ChatResponseFormatCapability | "not_requested" => {
  if (!responseFormat) {
    return "not_requested";
  }

  switch (responseFormat.type) {
    case "json_schema":
      return JSON_SCHEMA_PROVIDER_CAPABILITIES[provider];
  }
};
