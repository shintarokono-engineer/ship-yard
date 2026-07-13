import { BLOG_BODY_MAX, BLOG_BODY_MIN } from './announcement.constants';
import { parseAnnouncementDrafts } from './announcement-tool';

/** BLOG_BODY_MIN を満たす最小限の正常な本文。 */
const validBody = 'a'.repeat(BLOG_BODY_MIN + 10);

function validInput() {
  return {
    twitter: { text: 'リリースしました 🚀 #shipyard' },
    blog: { title: 'v1.2 をリリース', body: validBody, summary: '要約テキスト' },
  };
}

describe('parseAnnouncementDrafts', () => {
  it('正常な入力を AnnouncementDrafts に正規化する', () => {
    const out = parseAnnouncementDrafts(validInput());
    expect(out.twitter.text).toBe('リリースしました 🚀 #shipyard');
    expect(out.blog.title).toBe('v1.2 をリリース');
    expect(out.blog.body).toBe(validBody);
  });

  it('blog.body が BLOG_BODY_MAX を超えると throw する(今回追加した上限)', () => {
    const input = validInput();
    input.blog.body = 'a'.repeat(BLOG_BODY_MAX + 1);
    expect(() => parseAnnouncementDrafts(input)).toThrow(/ANNOUNCEMENT_GEN/);
  });

  it('blog.body が BLOG_BODY_MIN 未満だと throw する', () => {
    const input = validInput();
    input.blog.body = 'short';
    expect(() => parseAnnouncementDrafts(input)).toThrow(/ANNOUNCEMENT_GEN/);
  });

  it('twitter.text 欠落で throw する', () => {
    expect(() => parseAnnouncementDrafts({ blog: validInput().blog })).toThrow(/ANNOUNCEMENT_GEN/);
  });

  it('blog.{title,body,summary} 欠落で throw する', () => {
    expect(() => parseAnnouncementDrafts({ twitter: { text: 'x' } })).toThrow(/ANNOUNCEMENT_GEN/);
  });
});
