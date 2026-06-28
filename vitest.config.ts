import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolveFromRepoRoot = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

const repoAliases = {
  "@cs/config": resolveFromRepoRoot("packages/config/src/index.ts"),
  "@cs/shared": resolveFromRepoRoot("packages/shared/src/index.ts"),
  "@cs/convex-api": resolveFromRepoRoot("packages/convex-api/src/index.ts"),
  "@cs/core": resolveFromRepoRoot("packages/core/src/index.ts"),
  "@cs/db": resolveFromRepoRoot("packages/db/src/index.ts"),
  "@cs/ai/embeddings": resolveFromRepoRoot("packages/ai/src/embeddings/index.ts"),
  "@cs/ai": resolveFromRepoRoot("packages/ai/src/index.ts"),
  "@cs/storage": resolveFromRepoRoot("packages/storage/src/index.ts"),
  "@cs/rag": resolveFromRepoRoot("packages/rag/src/index.ts"),
};

export default defineConfig({
  resolve: {
    alias: repoAliases,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["scripts/**/*.test.ts", "apps/**/*.test.ts", "packages/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          include: ["convex/**/*.vitest.{ts,js}"],
          environment: "edge-runtime",
        },
      },
    ],
  },
});
