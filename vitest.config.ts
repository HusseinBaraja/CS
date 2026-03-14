import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
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
