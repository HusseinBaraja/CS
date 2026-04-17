import type { Doc, Id } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';

export const listConversationsByPhone = async (
  ctx: { db: DatabaseReader },
  companyId: Id<'companies'>,
  phoneNumber: string,
): Promise<Array<Doc<'conversations'>>> => {
  const conversations = await ctx.db
    .query('conversations')
    .withIndex('by_company_phone', (q) => q.eq('companyId', companyId).eq('phoneNumber', phoneNumber))
    .collect();

  return conversations.sort((left, right) => left._creationTime - right._creationTime || left._id.localeCompare(right._id));
};

export const listActiveConversations = async (
  ctx: { db: DatabaseReader },
  companyId: Id<'companies'>,
  phoneNumber: string,
): Promise<Array<Doc<'conversations'>>> => {
  const conversations = await ctx.db
    .query('conversations')
    .withIndex('by_company_phone_and_muted', (q) =>
      q.eq('companyId', companyId).eq('phoneNumber', phoneNumber).eq('muted', false)
    )
    .collect();

  return conversations.sort((left, right) => left._creationTime - right._creationTime || left._id.localeCompare(right._id));
};

export const loadConversationByPhone = async (
  ctx: { db: DatabaseReader },
  companyId: Id<'companies'>,
  phoneNumber: string,
): Promise<Doc<'conversations'> | null> => {
  const conversations = await listConversationsByPhone(ctx, companyId, phoneNumber);
  return conversations[0] ?? null;
};

export const loadConversationOrThrow = async (
  ctx: { db: DatabaseReader },
  companyId: Id<'companies'>,
  conversationId: Id<'conversations'>,
): Promise<Doc<'conversations'>> => {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.companyId !== companyId) {
    throw new Error('Conversation not found for company');
  }

  return conversation;
};

export const loadMessageOrThrow = async (
  ctx: { db: DatabaseReader },
  messageId: Id<'messages'>,
): Promise<Doc<'messages'>> => {
  const message = await ctx.db.get(messageId);
  if (!message) {
    throw new Error('Message not found');
  }

  return message;
};
