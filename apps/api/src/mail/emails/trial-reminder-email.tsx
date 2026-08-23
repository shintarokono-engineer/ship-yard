import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { JSX } from 'react';

/**
 * トライアル終了通知メールテンプレート(F20、ADR-012 v1.x)。
 *
 * `MailService.sendTrialReminder` から呼ばれる。3 日前 / 当日で別コンポーネントにはせず、
 * `daysLeft` を受けて文面を出し分ける。3 日前通知は「日差 1〜3 の未送信」で拾うため
 * 実際の残り日数が 3 とは限らず、**固定文言にすると本文と事実が食い違う**ため。
 */
export interface TrialReminderEmailProps {
  /** ワークスペース名 */
  workspaceName: string;
  /** 残り日数(0 = 終了当日) */
  daysLeft: number;
  /** 終了日時の表示用文字列(フォーマット済み) */
  trialEndLabel: string;
  /** 課金設定ページの絶対 URL */
  billingUrl: string;
}

export function TrialReminderEmail({
  workspaceName,
  daysLeft,
  trialEndLabel,
  billingUrl,
}: TrialReminderEmailProps): JSX.Element {
  const isLastDay = daysLeft === 0;
  const headline = isLastDay
    ? '本日でトライアルが終了します'
    : `あと ${daysLeft} 日でトライアルが終了します`;

  return (
    <Html lang="ja">
      <Head />
      <Preview>{`${workspaceName}:${headline}`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>{headline}</Heading>

          <Section>
            <Text style={textStyle}>
              ワークスペース「{workspaceName}」の Pro トライアルは <strong>{trialEndLabel}</strong>{' '}
              に終了します。
            </Text>
            <Text style={textStyle}>
              終了までにお支払い方法をご登録いただかない場合、AI
              機能(ドキュメント生成・壁打ち・診断・告知文生成)が停止し、プロジェクトの閲覧のみが可能な状態になります。
              <strong>作成済みのデータが削除されることはありません。</strong>
            </Text>
            <Text style={textStyle}>
              Pro プラン(月額 ¥1,480)を継続すると、引き続き月 300 クレジット分の AI
              機能をご利用いただけます。
            </Text>
          </Section>

          <Section style={buttonSectionStyle}>
            <Button href={billingUrl} style={buttonStyle}>
              お支払い方法を登録する
            </Button>
          </Section>

          <Section>
            <Text style={mutedTextStyle}>
              ボタンが効かない場合は、以下のリンクをブラウザで開いてください:
            </Text>
            <Link href={billingUrl} style={linkStyle}>
              {billingUrl}
            </Link>
          </Section>

          <Hr style={hrStyle} />

          <Section>
            <Text style={mutedTextStyle}>
              このメールは、トライアル期間中のワークスペースのオーナー宛にお送りしています。
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// スタイル定義(React Email では inline style を推奨。クラス CSS は Gmail で剥がされるため)
const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f5f7fa',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif',
  margin: 0,
  padding: '24px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px',
};

const headingStyle: React.CSSProperties = {
  color: '#111827',
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 24px',
};

const textStyle: React.CSSProperties = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 12px',
};

const mutedTextStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '1.6',
  margin: '0 0 8px',
};

const buttonSectionStyle: React.CSSProperties = {
  margin: '24px 0',
  textAlign: 'center',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#4f46e5',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 24px',
  textDecoration: 'none',
};

const linkStyle: React.CSSProperties = {
  color: '#4f46e5',
  fontSize: '13px',
  wordBreak: 'break-all',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #e5e7eb',
  margin: '24px 0',
};
