import type { ChatRequest, ChatResponse } from "@cs/ai";

export interface RetrievalRewriteTrace {
  systemPrompt: string;
  provider: string;
  usage?: unknown;
  apiResult: string;
}

const extractSystemPromptFromRequest = (request: ChatRequest): string =>
  (() => {
    const content = request.messages.find((message) => message.role === "system")?.content;
    if (typeof content === "string") {
      return content;
    }

    if (!content) {
      return "";
    }

    return content.map((part) => "text" in part ? part.text : "").join("\n");
  })();

export const buildRetrievalRewriteTrace = (
  request: ChatRequest,
  response: Pick<ChatResponse, "provider" | "usage" | "text">,
): RetrievalRewriteTrace => ({
  systemPrompt: extractSystemPromptFromRequest(request),
  provider: response.provider,
  usage: response.usage,
  apiResult: response.text,
});
