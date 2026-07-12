/**
 * react-doctor 設定(https://react.doctor)。
 *
 * off にしたルールは以下の理由:
 * - deslop/unused-export
 *   `apps/web/src/lib/api/types.ts` に API contract として意図的に公開している const 群
 *   (ROLES / SUB_STATUSES / INVITATION_STATUSES / DOC_TYPES / RAG_QA_ROLES / LP_BLOCK_TYPES /
 *    DIAGNOSIS_AXES / VALIDATION_AXES / VALIDATION_RECOMMENDATIONS / ANNOUNCEMENT_STATUSES /
 *    DELIVERY_STATUSES / BLOG_SUMMARY_MAX 等)と、`_shared/*-form.ts` の FORM_FIELDS(type FieldName を
 *    導出するための対の定義)を許容するため無効化。真に不要な export が積み上がった場合は、必要に応じて
 *    "warn" に戻して個別精査する。
 * - react-doctor/only-export-components
 *   `components/ui/badge.tsx` / `button.tsx` の cva `badgeVariants` / `buttonVariants` は shadcn/ui の
 *   標準生成物パターン。分離すると shadcn CLI 更新時に戻るため、Fast Refresh の恩恵と天秤にかけて放置。
 * - react-doctor/server-sequential-independent-await
 *   `readme/page.tsx:43` は既に `Promise.all([...])` で並列化済。react-doctor のパーサー限界で誤検知。
 * - react-doctor/prefer-dynamic-import
 *   `score-radar-chart.tsx` を Client wrapper + `next/dynamic({ssr:false})` で分割済。inner ファイル
 *   単体の import 文だけ再検知されるため、実質的な bundle 分離は達成済み。
 */
export default {
  rules: {
    'deslop/unused-export': 'off',
    'react-doctor/only-export-components': 'off',
    'react-doctor/server-sequential-independent-await': 'off',
    'react-doctor/prefer-dynamic-import': 'off',
  },
};
