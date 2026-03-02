import { logger } from "@cs/core";
import { mockChat } from "@cs/ai";

const main = async () => {
  const reply = await mockChat("bot bootstrap");
  logger.info({ provider: reply.provider }, reply.text);
};

void main();
