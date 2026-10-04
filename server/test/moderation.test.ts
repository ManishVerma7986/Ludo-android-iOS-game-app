import assert from 'node:assert/strict';
import test from 'node:test';

import { moderateChatMessage } from '../src/moderation';

test('moderates links, configured terms, and control characters', () => {
  assert.equal(moderateChatMessage('hello friend', ['blocked']), 'allowed');
  assert.equal(moderateChatMessage('visit https://example.invalid', []), 'links_not_allowed');
  assert.equal(moderateChatMessage('blocked phrase', ['blocked']), 'blocked_term');
  assert.equal(moderateChatMessage('bad\u0007text', []), 'invalid_characters');
});