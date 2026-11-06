import type { Message } from 'grammy/types';
import type { IncomingMessage } from '@/db/ingest';

const MS_IN_SECOND = 1000;

export type TelegramChatMessage = Omit<IncomingMessage, 'sourceId'> & {
  chatId: number;
};

type TelegramSender = Pick<IncomingMessage, 'externalId' | 'displayName'>;

function describeSender(message: Message): TelegramSender | undefined {
  const senderChat = message.sender_chat;
  // Anonymous admins and channels post through shared service accounts, the real author is the chat
  if (senderChat && senderChat.type !== 'private') {
    return { externalId: String(senderChat.id), displayName: senderChat.title };
  }

  if (!message.from) {
    return undefined;
  }

  const fullName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ');
  return { externalId: String(message.from.id), displayName: fullName };
}

export function mapTelegramMessage(message: Message): TelegramChatMessage | undefined {
  const text = message.text ?? message.caption;
  const sender = describeSender(message);
  if (!text || !sender) {
    return undefined;
  }

  return {
    chatId: message.chat.id,
    tgMessageId: message.message_id,
    sentAt: new Date(message.date * MS_IN_SECOND),
    text,
    ...sender,
  };
}
