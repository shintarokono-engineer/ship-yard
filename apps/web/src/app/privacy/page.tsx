import type { Metadata } from 'next';

import { LegalPage, LegalSection } from '@/app/_components/legal-page';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: `${LEGAL.serviceName} における個人情報の取り扱いについて。`,
  robots: { index: false, follow: true },
};

/**
 * プライバシーポリシー(個人情報保護法 21 条: 利用目的の公表)。
 *
 * **ひな形ではなく実装に基づいて書くこと。** 記載と実装がずれると公表義務を果たしたことに
 * ならない。特に第三者提供先は、実際にデータが渡る先を漏れなく挙げる必要がある:
 *
 * - Clerk … 認証(`User.clerkUserId` / email / name / image、OAuth 連携)
 * - Stripe … 決済(カード情報は Stripe が保持し、こちらは保持しない)
 * - Anthropic / OpenAI … **利用者が入力した内容が AI 生成の入力として送信される**
 * - Resend … 招待メール等の送信
 * - AWS / Vercel … ホスティング(保存先・実行環境)
 * - Google(GA4)/ Microsoft(Clarity)… アクセス解析(本番のみ)。閲覧ページ・操作イベント・
 *   擬似 ID のみで、PII は送らない(`apps/web/src/lib/analytics.ts`)
 *
 * 取得項目を増やしたり第三者提供先を追加したら、**このページも同時に更新する**。
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="プライバシーポリシー"
      lead={`${LEGAL.serviceName}(以下「本サービス」)における個人情報の取り扱いについて定めます。`}
    >
      <LegalSection heading="1. 事業者">
        <p>
          本サービスは {LEGAL.operator}(以下「当方」)が運営します。個人情報の取り扱いに関する
          お問い合わせは{' '}
          <a href={`mailto:${LEGAL.email}`} className="hover:text-foreground underline">
            {LEGAL.email}
          </a>{' '}
          までご連絡ください。
        </p>
      </LegalSection>

      <LegalSection heading="2. 取得する情報">
        <p>本サービスは、以下の情報を取得します。</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">アカウント情報</strong> — メールアドレス、氏名、
            プロフィール画像。Google または GitHub でサインインした場合、当該サービスから
            提供されるアカウント情報を取得します。
          </li>
          <li>
            <strong className="text-foreground">利用者が入力した内容</strong> — プロジェクト情報、
            ドキュメント、チェックリスト、AI への指示文など、本サービス上で作成・入力された情報。
          </li>
          <li>
            <strong className="text-foreground">利用状況</strong> — AI 機能の利用回数および
            消費クレジット数、アクセスログ、エラーログ。
          </li>
          <li>
            <strong className="text-foreground">決済に関する情報</strong> — 契約プラン、課金状況。
            <strong className="text-foreground">
              クレジットカード番号は Stripe が保持し、当方は取得も保存もしません。
            </strong>
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. 利用目的">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>本サービスの提供、本人確認、アカウントの管理</li>
          <li>AI による文書生成・分析など、利用者が要求した機能の実行</li>
          <li>利用料金の請求および決済</li>
          <li>お問い合わせへの対応、重要なお知らせの通知</li>
          <li>不具合の調査、品質および機能の改善</li>
          <li>不正利用の防止および対応</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. 第三者への提供・外部サービスの利用">
        <p>
          本サービスは、機能を提供するために以下の外部サービスを利用しており、その範囲で情報を
          送信します。各社の取り扱いは、それぞれのプライバシーポリシーに従います。
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Clerk</strong>(認証)— メールアドレス、氏名、
            プロフィール画像、外部アカウント連携情報
          </li>
          <li>
            <strong className="text-foreground">Stripe</strong>(決済)— メールアドレス、
            契約プラン、決済情報
          </li>
          <li>
            <strong className="text-foreground">Anthropic、OpenAI</strong>(AI 機能)—{' '}
            <strong className="text-foreground">
              AI 機能を利用した際に、利用者が入力・保存した内容が生成の入力として送信されます。
            </strong>
          </li>
          <li>
            <strong className="text-foreground">Resend</strong>(メール配信)— 宛先の
            メールアドレス、メール本文
          </li>
          <li>
            <strong className="text-foreground">Amazon Web Services、Vercel</strong>
            (ホスティング)— 本サービスのデータの保存先および実行環境
          </li>
          <li>
            <strong className="text-foreground">Google(Google アナリティクス)、Microsoft</strong>
            (Microsoft Clarity)(アクセス解析)— 閲覧したページ、クリック等の操作、
            ブラウザ・端末の情報、IP アドレス、および利用者を識別しない擬似 ID。
            <strong className="text-foreground">
              メールアドレス、氏名、ワークスペース名、AI で生成した文書の内容は送信しません。
            </strong>
          </li>
        </ul>
        <p>
          上記のほか、法令に基づく開示請求を受けた場合を除き、本人の同意なく第三者へ個人情報を
          提供することはありません。
        </p>
      </LegalSection>

      <LegalSection heading="5. 保存期間と削除">
        <p>
          個人情報は、利用目的の達成に必要な期間、または法令で定められた期間保存します。
          アカウントを削除した場合、当該アカウントは無効化され、本サービス上でご利用いただけなく
          なります。保存されたデータの完全な消去をご希望の場合は、上記のお問い合わせ先までご連絡
          ください。なお、法令上の保存義務がある情報(取引記録など)は、定められた期間保存します。
        </p>
      </LegalSection>

      <LegalSection heading="6. 開示・訂正・利用停止">
        <p>
          ご本人から個人情報の開示、訂正、追加、削除、利用停止のご請求があった場合、ご本人で
          あることを確認のうえ、法令に従い遅滞なく対応します。上記のお問い合わせ先までご連絡
          ください。
        </p>
      </LegalSection>

      <LegalSection heading="7. Cookie とアクセス解析の利用">
        <p>
          本サービスは、サインイン状態の維持のために Cookie を使用します。ブラウザの設定で Cookie
          を無効にした場合、本サービスをご利用いただけません。
        </p>
        <p>
          あわせて、サービス改善のために Google アナリティクス(GA4)および Microsoft Clarity
          を利用しています。これらは Cookie 等により、閲覧したページ、クリックやスクロールなどの
          操作、ブラウザ・端末の情報を収集します。Microsoft Clarity では、画面上の操作を再現した
          記録(セッションリプレイ)およびヒートマップが生成されます。
        </p>
        <p>
          収集した情報は、機能の改善と不具合の把握のみに利用します。個人を特定できる情報
          (メールアドレス、氏名、ワークスペース名、AI で生成した文書の内容)は送信しておらず、
          <strong className="text-foreground">広告目的でのトラッキングは行っていません。</strong>
        </p>
        <p>
          収集を望まない場合は、ブラウザの Cookie 設定、または{' '}
          <a
            href="https://tools.google.com/dlpage/gaoptout"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground underline"
          >
            Google アナリティクス オプトアウト アドオン
          </a>{' '}
          をご利用ください。各社の取り扱いは{' '}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground underline"
          >
            Google のプライバシーポリシー
          </a>{' '}
          および{' '}
          <a
            href="https://privacy.microsoft.com/privacystatement"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground underline"
          >
            Microsoft のプライバシーに関する声明
          </a>{' '}
          に従います。
        </p>
      </LegalSection>

      <LegalSection heading="8. 本ポリシーの変更">
        <p>
          法令の変更や本サービスの内容変更に伴い、本ポリシーを改定することがあります。重要な
          変更を行う場合は、本サービス上でお知らせします。
        </p>
      </LegalSection>
    </LegalPage>
  );
}
