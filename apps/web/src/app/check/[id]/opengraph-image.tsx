import { ImageResponse } from 'next/og';

import { fetchPublicCheck } from '@/lib/api/public-check';
import { toDisplayScore } from '@/lib/api/types';

export const alt = 'Idea Check Score';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * `/check/{id}` の OG 画像(ADR-015)。
 *
 * **文言が英字と数字だけなのは意図的**:`ImageResponse`(Satori)は CJK フォントを内蔵しておらず、
 * 日本語を入れると豆腐になる。日本語化するには woff の読み込みが要る。
 */
export default async function CheckResultOgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await fetchPublicCheck(id);
  // 保持期間切れでも画像は返す。404 にすると、貼られた投稿のサムネイルが壊れる。
  const score = check ? toDisplayScore(check.totalScore) : null;

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
      <div style={{ display: 'flex', fontSize: 34, color: '#c7d2fe', letterSpacing: 2 }}>
        IDEA CHECK SCORE
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 8 }}>
        <span style={{ fontSize: 210, fontWeight: 700, lineHeight: 1 }}>{score ?? '--'}</span>
        <span style={{ fontSize: 60, color: '#c7d2fe', marginLeft: 12 }}>/ 100</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: 48,
          fontSize: 30,
          color: '#a5b4fc',
        }}
      >
        <svg width="40" height="40" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#ffffff" />
          <path fill="#4f46e5" d="M9 8h3.5l7 9.6V8H23v16h-3.5l-7-9.6V24H9V8z" />
        </svg>
        <span>Neorie</span>
      </div>
    </div>,
    { ...size },
  );
}
