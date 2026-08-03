import { ImageResponse } from 'next/og';

export const alt = 'Neorie — Ship your product, faster.';
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
      {/* ブランドマーク(白地に indigo で N を抜く)。indigo 背景の上なので
          白の角丸スクエア + 背景色の N という反転構成にする。 */}
      <svg width="120" height="120" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="7" fill="#ffffff" />
        <path fill="#4f46e5" d="M9 8h3.5l7 9.6V8H23v16h-3.5l-7-9.6V24H9V8z" />
      </svg>
      <div style={{ display: 'flex', marginTop: 36, fontSize: 84, fontWeight: 700 }}>Neorie</div>
      <div style={{ display: 'flex', marginTop: 12, fontSize: 36, color: '#c7d2fe' }}>
        Ship your product, faster.
      </div>
      <div style={{ display: 'flex', marginTop: 40, fontSize: 24, color: '#a5b4fc' }}>
        AI-assisted product development for indie devs & small teams
      </div>
    </div>,
    { ...size },
  );
}
