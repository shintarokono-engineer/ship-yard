import { parseLpBlocks } from './lp-blocks';

describe('parseLpBlocks — footer の空ブロック抑止', () => {
  it('copyright も links も無い footer は push しない', () => {
    const out = parseLpBlocks([{ type: 'footer', copyright: '', items: [] }]);
    expect(out).toHaveLength(0);
  });

  it('copyright があれば footer を残す', () => {
    const out = parseLpBlocks([{ type: 'footer', copyright: '© 2026 Shipyard', items: [] }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'footer', copyright: '© 2026 Shipyard' });
  });
});

describe('parseLpBlocks — URL サニタイズ(BE 多層防御)', () => {
  it('cta の javascript: href は # に無害化し、ブロック自体は残す', () => {
    const out = parseLpBlocks([
      { type: 'cta', heading: 'h', buttonText: 'go', buttonHref: 'javascript:alert(1)' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'cta', buttonHref: '#' });
  });

  it('http(s) の href はそのまま通す', () => {
    const out = parseLpBlocks([
      { type: 'cta', heading: 'h', buttonText: 'go', buttonHref: 'https://example.com' },
    ]);
    expect(out[0]).toMatchObject({ buttonHref: 'https://example.com' });
  });

  it('相対パス href は許可する', () => {
    const out = parseLpBlocks([
      { type: 'cta', heading: 'h', buttonText: 'go', buttonHref: '/pricing' },
    ]);
    expect(out[0]).toMatchObject({ buttonHref: '/pricing' });
  });

  it('hero の image が危険スキームなら undefined に落とす', () => {
    const out = parseLpBlocks([
      { type: 'hero', heading: 'h', ctaText: 'c', ctaHref: '/x', image: 'javascript:alert(1)' },
    ]);
    expect(out[0]).toMatchObject({ type: 'hero' });
    expect((out[0] as { image?: string }).image).toBeUndefined();
  });

  it('hero の image が http(s) なら保持する', () => {
    const out = parseLpBlocks([
      { type: 'hero', heading: 'h', ctaText: 'c', ctaHref: '/x', image: 'https://cdn.example/x.png' },
    ]);
    expect((out[0] as { image?: string }).image).toBe('https://cdn.example/x.png');
  });
});
