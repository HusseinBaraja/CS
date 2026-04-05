import type { TurnResolutionInput } from '@cs/shared';
import { detectTurnResolutionLanguage, normalizeTurnResolutionText } from "./normalization";
import { applyShadowModelResult, type TurnResolutionShadowModelRefiner } from "./modelAssisted";
import { resolveUserTurnDeterministically } from "./deterministic";

export type {
  TurnResolutionShadowCandidateFamily,
  TurnResolutionShadowModelInput,
  TurnResolutionShadowModelOutput,
  TurnResolutionShadowModelRefiner,
} from "./modelAssisted";

export { resolveUserTurnDeterministically } from "./deterministic";

export interface ResolveUserTurnOptions {
  runShadowModel?: TurnResolutionShadowModelRefiner;
}

export const resolveUserTurn = async (
  input: TurnResolutionInput,
  options: ResolveUserTurnOptions = {},
) => {
  const normalizedInput: TurnResolutionInput = {
    ...input,
    rawInboundText: normalizeTurnResolutionText(input.rawInboundText),
    languageHint: detectTurnResolutionLanguage(input),
  };
  const deterministic = resolveUserTurnDeterministically(normalizedInput);

  if (
    !normalizedInput.resolutionPolicy.allowModelAssistedFallback
    || !deterministic.shadowCandidateFamily
    || !options.runShadowModel
  ) {
    return deterministic.resolvedTurn;
  }

  const shadowResult = await options.runShadowModel({
    rawInboundText: normalizedInput.rawInboundText,
    normalizedInboundText: normalizeTurnResolutionText(normalizedInput.rawInboundText),
    language: normalizedInput.languageHint ?? "en",
    candidateFamily: deterministic.shadowCandidateFamily,
  });

  return applyShadowModelResult(deterministic.resolvedTurn, shadowResult);
};
