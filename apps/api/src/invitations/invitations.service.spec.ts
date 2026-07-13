import { InvitationStatus } from './invitations.constants';
import { computeInvitationStatus, hashInvitationToken } from './invitations.service';

describe('hashInvitationToken', () => {
  it('SHA-256 の hex 64 文字を返し、決定的である', () => {
    const h = hashInvitationToken('raw-token');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken('raw-token')).toBe(h);
  });

  it('入力が異なれば別のハッシュになる', () => {
    expect(hashInvitationToken('token-a')).not.toBe(hashInvitationToken('token-b'));
  });

  it('生トークンをそのまま返さない(DB に平文を残さない)', () => {
    expect(hashInvitationToken('raw-token')).not.toBe('raw-token');
  });
});

describe('computeInvitationStatus(優先順: REVOKED > ACCEPTED > EXPIRED > PENDING)', () => {
  const now = new Date('2026-07-13T00:00:00Z');
  const past = new Date('2020-01-01T00:00:00Z');
  const future = new Date('2999-01-01T00:00:00Z');

  it('revoked は受諾済み・期限切れより優先される', () => {
    expect(
      computeInvitationStatus({ acceptedAt: now, revokedAt: now, expiresAt: past }, now),
    ).toBe(InvitationStatus.REVOKED);
  });

  it('受諾済みは期限切れでも ACCEPTED(accept の判定順を expired より先にした回帰テスト)', () => {
    expect(
      computeInvitationStatus({ acceptedAt: now, revokedAt: null, expiresAt: past }, now),
    ).toBe(InvitationStatus.ACCEPTED);
  });

  it('未受諾で期限切れは EXPIRED', () => {
    expect(
      computeInvitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: past }, now),
    ).toBe(InvitationStatus.EXPIRED);
  });

  it('有効期限内・未受諾は PENDING', () => {
    expect(
      computeInvitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: future }, now),
    ).toBe(InvitationStatus.PENDING);
  });
});
