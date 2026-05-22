import { ImageResponse } from 'next/og';

export const alt = 'Shipyard — Ship your product, faster.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * `/` の OG 画像を動的生成する(SNS シェア時のサムネイル)。
 *
 * 文言を英語にしているのは意図的:`ImageResponse`(Satori)は CJK フォントを内蔵せず、
 * 日本語を入れると豆腐(□)になるため。日本語化するにはフォント woff の読み込みが要る。
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#4f46e5',
          color: '#ffffff',
        }}
      >
        <svg width="128" height="128" viewBox="0 0 32 32" fill="#ffffff">
          <path d="M17 4v15h11z" />
          <path d="M15 8v11H7z" />
          <path d="M3 21h26c-1.8 5.4-6.6 8-13 8S4.8 26.4 3 21z" />
        </svg>
        <div style={{ display: 'flex', marginTop: 36, fontSize: 84, fontWeight: 700 }}>
          Shipyard
        </div>
        <div style={{ display: 'flex', marginTop: 12, fontSize: 36, color: '#c7d2fe' }}>
          Ship your product, faster.
        </div>
        <div style={{ display: 'flex', marginTop: 40, fontSize: 24, color: '#a5b4fc' }}>
          AI-assisted product development for indie devs & small teams
        </div>
      </div>
    ),
    { ...size },
  );
}
