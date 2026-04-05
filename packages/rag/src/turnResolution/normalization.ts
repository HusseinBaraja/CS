import type { TurnResolutionInput, TurnResolutionRecentTurn } from '@cs/shared';

const ARABIC_CHAR_PATTERN = /[\u0600-\u06FF]/u;

export const normalizeTurnResolutionText = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeTurnResolutionTextForMatch = (value: string): string =>
  normalizeTurnResolutionText(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export const detectTurnResolutionLanguage = (
  input: Pick<TurnResolutionInput, "languageHint" | "rawInboundText">,
): "ar" | "en" => {
  if (input.languageHint) {
    return input.languageHint;
  }

  return ARABIC_CHAR_PATTERN.test(input.rawInboundText) ? "ar" : "en";
};

export const extractNumberedLines = (value: string): Array<{ displayIndex: number; label: string }> =>
  value
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+)[\.\)]\s+(.+?)\s*$/u))
    .flatMap((match) => {
      if (!match) {
        return [];
      }

      const displayIndex = Number(match[1]);
      const label = normalizeTurnResolutionText(match[2] ?? "");
      if (!Number.isFinite(displayIndex) || label.length === 0) {
        return [];
      }

      return [{ displayIndex, label }];
    });

export const findLatestAssistantTurn = (
  recentTurns: TurnResolutionRecentTurn[],
): TurnResolutionRecentTurn | null => {
  for (let index = recentTurns.length - 1; index >= 0; index -= 1) {
    const turn = recentTurns[index];
    if (turn?.role === "assistant") {
      return turn;
    }
  }

  return null;
};

export const extractRecentTopicSeed = (recentTurns: TurnResolutionRecentTurn[]): string | null => {
  const assistantTurn = findLatestAssistantTurn(recentTurns);
  const turnText = assistantTurn?.text ?? recentTurns.at(-1)?.text;
  if (!turnText) {
    return null;
  }

  const normalizedText = normalizeTurnResolutionText(turnText);
  const englishPatterns = [
    /\babout(?: your| the)? (?<label>[a-z0-9][a-z0-9\s-]+?)(?:[.!?]|$)/iu,
    /\bour (?<label>[a-z0-9][a-z0-9\s-]+?) comes in\b/iu,
    /\bthe (?<label>[a-z0-9][a-z0-9\s-]+?) (?:comes|has|is)\b/iu,
  ];
  for (const pattern of englishPatterns) {
    const match = normalizedText.match(pattern);
    const label = normalizeTurnResolutionText(match?.groups?.label ?? "");
    if (label.length > 0) {
      return label;
    }
  }

  const arabicMatch = normalizedText.match(/\bعن (?<label>[\p{Script=Arabic}0-9\s-]+?)(?:[.!?]|$)/u);
  const arabicLabel = normalizeTurnResolutionText(arabicMatch?.groups?.label ?? "");
  if (arabicLabel.length > 0) {
    return arabicLabel;
  }

  return null;
};
