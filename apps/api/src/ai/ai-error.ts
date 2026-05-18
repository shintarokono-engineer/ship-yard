import { BadGatewayException } from '@nestjs/common';

/**
 * AI プロバイダ(Anthropic / OpenAI)からの応答が期待形式ではなかった、
 * またはプロバイダ側の障害で処理が完結しなかったことを表す例外(Day 16、Bad Gateway = 502)。
 *
 * **なぜ 502 か(500 ではなく)**: AI プロバイダは Shipyard の上流依存であり、
 * 上流依存の問題で処理が完結しない場合は意味論的に 502 Bad Gateway が正しい。
 * 500 だと「Shipyard 側のコードのバグ」と区別がつかず、運用上の切り分けが困難になる。
 *
 * **使い分け**:
 * - Tool_use ブロック欠落・空 content・JSON スキーマ不一致 等の **不正レスポンス** → 本クラスを `throw`
 * - SDK 例外(レート制限・ネットワーク不通 等)を捕まえて 502 化したいときも本クラス(原因は `cause` に格納)
 * - **握りつぶし方針(EmbeddingService / RagSearchService)はそのまま維持**(主処理を守る Day 12/13 設計、本クラスには変えない)
 *
 * 例外メッセージはユーザーに露出するため、機能名や原因(Claude / OpenAI / 何のフィールドが欠けたか)を
 * 含めると運用時の切り分けが楽になる。
 */
export class AIBadResponseError extends BadGatewayException {
  constructor(message: string, options?: { cause?: unknown }) {
    // HttpException 標準フォーマット(NestJS 9+)に揃える。super 経由で渡すことで
    // stack trace への cause 反映や、Sentry 等の error reporter の標準連携が効く。
    super(message, { cause: options?.cause });
  }
}
