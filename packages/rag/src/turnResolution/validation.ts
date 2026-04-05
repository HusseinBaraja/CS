import type {
  CanonicalConversationPresentedListDto,
  TurnReferencedEntity,
  TurnResolutionInput,
} from '@cs/shared';

export const isFreshCanonicalContext = (input: TurnResolutionInput): boolean =>
  input.canonicalState?.freshness.status !== "stale";

export const canUseCanonicalSourceForBinding = (input: TurnResolutionInput): boolean =>
  isFreshCanonicalContext(input);

export const hasValidReferencedEntityAnchor = (
  referencedEntities: TurnReferencedEntity[] | undefined,
  presentedList: CanonicalConversationPresentedListDto | undefined,
): boolean => Boolean((referencedEntities && referencedEntities.length > 0) || presentedList?.items.length);

export const getSingleReferencedEntity = (
  referencedEntities: TurnReferencedEntity[],
): TurnReferencedEntity | null => referencedEntities.length === 1 ? referencedEntities[0] ?? null : null;
