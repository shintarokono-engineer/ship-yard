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
 * メンバー招待メールテンプレート(React Email、ADR-007、Day 17)。
 *
 * `MailService.sendInvitation` から呼ばれる。`@react-email/render` で HTML 文字列に変換され、
 * Resend SDK 経由で送信される。
 *
 * **なぜ React Email か(ADR-007 で言及)**:
 * - メールクライアント互換性(Gmail / Outlook / Apple Mail)を `<table>` ベースで自動生成
 * - 型安全(props を TypeScript で受け取り、JSX で props 渡し漏れを compile-time に検出)
 * - 自動 HTML エスケープで XSS 防御(workspace 名にユーザー入力が入っても安全)
 * - 将来メール種別が増えたとき(課金通知 / パスワードリセット)、共通 Header / Footer をコンポーネント化できる
 *
 * 文言・構成のポリシー:
 * - 件名は MailService 側で組み立てる
 * - 本文は「誰から / どのワークスペースに / 何のロールで / いつまで」を 4 要素で明示
 * - 承諾リンクは目立つボタンスタイル + テキストリンクの両方を載せる(ボタンが効かないクライアント対策)
 */
export interface InvitationEmailProps {
  /** ワークスペース名(招待先テナント) */
  workspaceName: string;
  /** 招待者の表示名(User.name、null なら email を表示) */
  inviterName: string;
  /** 付与されるロール(表示用、日本語ラベル) */
  roleLabel: string;
  /** 招待リンクの絶対 URL(`${APP_BASE_URL}/invitations/${token}`) */
  inviteUrl: string;
  /** 有効期限(ISO 文字列ではなく既にフォーマット済みの表示用文字列) */
  expiresAtLabel: string;
}

export function InvitationEmail({
  workspaceName,
  inviterName,
  roleLabel,
  inviteUrl,
  expiresAtLabel,
}: InvitationEmailProps): JSX.Element {
  return (
    <Html lang="ja">
      <Head />
      <Preview>{`${inviterName} さんから ${workspaceName} への招待が届きました`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>{workspaceName} への招待</Heading>

          <Section>
            <Text style={textStyle}>
              {inviterName} さんから、 Shipyard ワークスペース「{workspaceName}
              」への招待が届いています。
            </Text>
            <Text style={textStyle}>
              ロール: <strong>{roleLabel}</strong>
            </Text>
          </Section>

          <Section style={buttonSectionStyle}>
            <Button href={inviteUrl} style={buttonStyle}>
              招待を承諾する
            </Button>
          </Section>

          <Section>
            <Text style={mutedTextStyle}>
              ボタンが効かない場合は、以下のリンクをブラウザで開いてください:
            </Text>
            <Link href={inviteUrl} style={linkStyle}>
              {inviteUrl}
            </Link>
          </Section>

          <Hr style={hrStyle} />

          <Section>
            <Text style={mutedTextStyle}>
              この招待リンクは <strong>{expiresAtLabel}</strong>{' '}
              まで有効です。期限を過ぎた場合は招待者に再発行を依頼してください。
            </Text>
            <Text style={mutedTextStyle}>
              心当たりがない場合は、このメールを破棄してください。承諾しない限りワークスペースには参加されません。
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
  backgroundColor: '#2563eb',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 24px',
  textDecoration: 'none',
};

const linkStyle: React.CSSProperties = {
  color: '#2563eb',
  fontSize: '13px',
  wordBreak: 'break-all',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #e5e7eb',
  margin: '24px 0',
};
