export interface ChatResult {
  text: string;
  provider: "deepseek" | "gemini" | "groq";
}

export const mockChat = async (input: string): Promise<ChatResult> => {
  return {
    text: `echo:${input}`,
    provider: "deepseek"
  };
};
