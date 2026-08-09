import type { Metadata } from 'next';

import { LegalPage, LegalTable } from '@/app/_components/legal-page';
import { DISCLOSURE_ON_REQUEST, LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記',
  description: `${LEGAL.serviceName} の特定商取引法に基づく表記です。`,
  // 法的ページは検索結果に出す必要がなく、出るとサービス本体より上に来ることもある。
  // 未認証で到達できること(リンク・直 URL)が要件なので、インデックスはさせない。
  robots: { index: false, follow: true },
};

/**
 * 特定商取引法に基づく表記(特商法 11 条)。
 *
 * **有料サービスを提供する以上、掲示は法令上の義務**であり、Stripe も加盟店に掲示を求める
 * (未掲示だと審査で指摘され入金保留になりうる)。
 *
 * 記載内容は実装に合わせること。特に**解約条件**は `billing` の実装と一致している必要がある:
 * - 7 日間の無料トライアル(`trial_period_days: 7`)
 * - 決済手段未登録のままトライアルが終わると自動解約(`missing_payment_method: 'cancel'`)
 * - 解約は Stripe Customer Portal から(`/w/{slug}/settings/billing`)
 */
export default function TokushohoPage() {
  return (
    <LegalPage
      title="特定商取引法に基づく表記"
      lead="特定商取引法第 11 条に基づき、以下のとおり表示します。"
    >
      <LegalTable
        rows={[
          { label: '販売事業者', value: LEGAL.operator },
          { label: '運営統括責任者', value: LEGAL.operator },
          { label: '所在地', value: DISCLOSURE_ON_REQUEST },
          { label: '電話番号', value: DISCLOSURE_ON_REQUEST },
          {
            label: 'お問い合わせ先',
            value: (
              <a href={`mailto:${LEGAL.email}`} className="hover:text-foreground underline">
                {LEGAL.email}
              </a>
            ),
          },
          {
            label: '販売価格',
            value: (
              <>
                Pro プラン: 月額 1,480 円(税込)
                <br />
                Team プラン: 1 ユーザーあたり月額 2,800 円(税込)
                <br />
                各プランの詳細は
                <a href="/#pricing" className="hover:text-foreground underline">
                  料金ページ
                </a>
                をご確認ください。
              </>
            ),
          },
          {
            label: '商品代金以外の必要料金',
            value:
              'インターネット接続に必要な通信料金はお客様のご負担となります。それ以外の追加料金はいただきません。',
          },
          { label: '支払方法', value: 'クレジットカード決済(Stripe を利用)' },
          {
            label: '支払時期',
            value:
              '無料トライアル終了日に初回課金が発生し、以後は毎月同日に自動で課金されます。プラン変更時は Stripe の日割り計算に従います。',
          },
          {
            label: 'サービスの提供時期',
            value: 'お申し込み手続きの完了後、ただちにご利用いただけます。',
          },
          {
            label: '無料トライアル',
            value:
              '新規登録から 7 日間、Pro プランの全機能を無料でお試しいただけます。トライアル期間中にクレジットカードのご登録がない場合、期間終了時に自動で解約となり、課金は発生しません。',
          },
          {
            label: '解約について',
            value: (
              <>
                サービス内の「設定 → 請求」から Stripe
                カスタマーポータルを開き、いつでも解約できます。
                解約後は当該請求期間の終了日までご利用いただけます。
              </>
            ),
          },
          {
            label: '返品・返金について',
            value:
              'サービスの性質上、ご利用期間途中での解約による日割りでの返金はいたしかねます。当方の責めに帰すべき事由によりサービスを提供できなかった場合は、個別に対応いたします。',
          },
          {
            label: '動作環境',
            value:
              '最新版の Google Chrome / Safari / Microsoft Edge / Firefox。JavaScript と Cookie を有効にしてご利用ください。',
          },
        ]}
      />
    </LegalPage>
  );
}
