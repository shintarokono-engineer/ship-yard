import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { EMBEDDING_MODEL } from './ai.constants';

/** 1 回の embedding 呼び出しの結果 + 使用トークン数(AIUsage 記録用)。 */
export interface EmbedResult {
  /** 1536 次元の埋め込みベクトル(text-embedding-3-small)。 */
  vector: number[];
  /** 入力トークン数(課金根拠)。 */
  tokensIn: number;
  /** 使用したモデル ID(常に `EMBEDDING_MODEL`)。 */
  model: string;
}

/** text-embedding-3-small の入力上限(モデル仕様、トークン数)。 */
const MAX_INPUT_TOKENS = 8191;

/**
 * 入力テキストの最大文字数(切り詰めの閾値)。
 * 日本語は 1 トークン ≒ 1〜2 文字、英語は 1 トークン ≒ 4 文字なので、最悪ケース(全部日本語)を想定して
 * 2 倍に丸める(=16,382 文字)。これを超える入力は先頭から切り詰めて API 上限超過を防ぐ
 * (`embedText` の `slice` 処理。tiktoken による厳密測定は MVP では不採用)。
 */
const MAX_INPUT_CHARS = MAX_INPUT_TOKENS * 2;

/**
 * OpenAI API クライアントのラッパー(embedding 専用、ADR-005)。
 * シークレットキー(`OPENAI_API_KEY`)で初期化。Anthropic の責務(生成)とは混ぜず、本サービスは
 * 「テキスト → 1536 次元ベクトル」だけを担う。利用記録は `AIUsageService.record(...)` で別途。
 */
@Injectable()
export class OpenAIService {
  private readonly client: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({ apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY') });
  }

  /**
   * 1 つのテキストを `text-embedding-3-small` で埋め込み、1536 次元のベクトルを返す。
   * 上限を超える長さの入力は先頭から `MAX_INPUT_CHARS` で切り詰める(API エラーを避ける防御)。
   * 空文字 / 空白のみは呼び出し側で弾く前提。
   */
  async embedText(text: string): Promise<EmbedResult> {
    const trimmed = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
    const res = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed,
    });
    const first = res.data[0];
    if (!first || !Array.isArray(first.embedding)) {
      throw new Error('OpenAI did not return the expected embedding vector');
    }
    return {
      vector: first.embedding,
      tokensIn: res.usage.prompt_tokens,
      model: EMBEDDING_MODEL,
    };
  }
}
