export interface ReadReceiptMessage {
  id: string;
  remoteJid: string;
}

const toReadReceiptMessageKey = (message: ReadReceiptMessage): string =>
  `${message.remoteJid}:${message.id}`;

export const createReadReceiptDeduper = (): (
  message: ReadReceiptMessage,
  markRead: () => Promise<void>,
) => Promise<void> => {
  const inFlightByMessageKey = new Map<string, Promise<void>>();

  return async (message, markRead) => {
    const messageKey = toReadReceiptMessageKey(message);
    const existing = inFlightByMessageKey.get(messageKey);
    if (existing) {
      return existing;
    }

    const current = markRead();
    inFlightByMessageKey.set(messageKey, current);
    try {
      await current;
    } finally {
      if (inFlightByMessageKey.get(messageKey) === current) {
        inFlightByMessageKey.delete(messageKey);
      }
    }
  };
};
