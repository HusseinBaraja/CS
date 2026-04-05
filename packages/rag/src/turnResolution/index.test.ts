import { describe, expect, test } from 'bun:test';
import { resolveUserTurn } from './index';
import { turnResolutionFixtures } from './fixtures';

describe("resolveUserTurn", () => {
  for (const fixture of turnResolutionFixtures) {
    test(fixture.id, async () => {
      const shadowInputs: unknown[] = [];
      const result = await resolveUserTurn(fixture.input, {
        runShadowModel: fixture.shadowModelResult
          ? async (input) => {
            shadowInputs.push(input);
            return fixture.shadowModelResult ?? null;
          }
          : undefined,
      });

      expect(result).toMatchObject(fixture.expected);
      if (fixture.expectedClarificationReason) {
        expect(result.clarification?.reason).toBe(fixture.expectedClarificationReason);
      }

      if (fixture.shadowModelResult) {
        expect(shadowInputs).toHaveLength(1);
      } else {
        expect(shadowInputs).toEqual([]);
      }
    });
  }
});
