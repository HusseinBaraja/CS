#!/usr/bin/env bun
import { env } from '@cs/config';
import { logError, logger } from '@cs/core';
import { convexInternal, createConvexAdminClient } from '@cs/db';

const printUsage = (): void => {
  console.log("Usage: cs <command>");
  console.log("");
  console.log("Commands:");
  console.log("  seed    Seed Convex with sample catalog data");
};

const runSeed = async (): Promise<void> => {
  const client = createConvexAdminClient();
  const result = await client.mutation(convexInternal.seed.seedSampleData, {});

  console.log(`Seeded ${result.companyName} (${result.companyId})`);
  console.log(
    [
      `categories=${result.counts.categories}`,
      `products=${result.counts.products}`,
      `variants=${result.counts.productVariants}`,
      `offers=${result.counts.offers}`,
      `currencyRates=${result.counts.currencyRates}`,
      `clearedCompanies=${result.clearedCompanies}`,
    ].join(" "),
  );
};

const main = async (): Promise<void> => {
  const [command] = process.argv.slice(2);

  if (!command) {
    logger.info({ env: env.NODE_ENV }, "cli ready");
    printUsage();
    return;
  }

  switch (command) {
    case "seed":
      await runSeed();
      return;
    default:
      printUsage();
      throw new Error(`Unknown command: ${command}`);
  }
};

try {
  await main();
} catch (error) {
  logError(logger, error, "cli command failed");
  process.exitCode = 1;
}
