export type ModerationResult = 'allowed' | 'links_not_allowed' | 'blocked_term' | 'invalid_characters';

export function moderateChatMessage(message: string, blockedTerms: string[]): ModerationResult {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)) {
    return 'invalid_characters';
  }

  if (/(?:https?:\/\/|www\.)/i.test(message)) {
    return 'links_not_allowed';
  }

  const normalizedMessage = message.toLocaleLowerCase();
  if (blockedTerms.some((term) => normalizedMessage.includes(term))) {
    return 'blocked_term';
  }

  return 'allowed';
}