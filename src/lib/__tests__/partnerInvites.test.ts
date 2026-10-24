import type { PartnerInvite } from '@/types';
import { adoptServerInviteId } from '../partnerInvites';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function invite(id: string): PartnerInvite {
  return {
    id,
    fromUserId: 'me',
    fromUsername: 'qwer',
    fromAvatar: '🧑',
    toUserId: 'them',
    toUsername: 'asdf',
    status: 'pending',
    createdAt: '2026-10-24T13:00:00.000Z',
  };
}

// Server kept our id (or answered without one): list unchanged.
{
  const list = [invite('local'), invite('other')];
  assert(adoptServerInviteId(list, 'local', 'local') === list, 'same id keeps the list');
  assert(adoptServerInviteId(list, 'local', undefined) === list, 'no server id keeps the list');
  assert(adoptServerInviteId(list, 'local', null) === list, 'null server id keeps the list');
}

// Server returned the invite that already waited: the local copy takes its id, order kept.
{
  const next = adoptServerInviteId([invite('local'), invite('other')], 'local', 'server');
  assert(next.length === 2, 'no invite added or lost');
  assert(next[0].id === 'server' && next[1].id === 'other', 'local copy renamed in place');
  assert(next[0].toUsername === 'asdf', 'other fields kept');
}

// The server's invite is already listed (e.g. a refetch landed first): drop the local copy.
{
  const next = adoptServerInviteId([invite('local'), invite('server')], 'local', 'server');
  assert(next.length === 1 && next[0].id === 'server', 'one card for the one row');
}

console.log('partnerInvites fixtures: all passed');
