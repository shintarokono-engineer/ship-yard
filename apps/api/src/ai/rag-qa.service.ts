import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, type RagQaMessage, type RagQaSession, RagQaRole } from '@shipyard/db';

import { PrismaService } from '../prisma/prisma.service';
import {
  AI_MODEL_SONNET,
  RAG_QA_MAX_MESSAGES_PER_SESSION,
  RAG_QA_MAX_TOKENS,
  RAG_QA_MAX_TURNS,
} from './ai.constants';
import { AnthropicService } from './anthropic.service';
import { formatReferenceSection } from './format-reference';
import { AI_PERSONA_INTRO } from './prompts';
import type { RagSearchHit } from './rag-search.service';
import { extractTextContent } from './tool-use';

/** RagQaService が想定するプロジェクト情報の最小型。controller 側で取得して渡す。 */
interface ProjectContext {
  name: string;
  description: string | null;
  status: string;
}

/** `RagQaService.ask` の引数。`references` は controller の RAG 検索結果(`RagSearchHit[]`)をそのまま渡す。 */
export interface AskInput {
  tenantId: string;
  sessionId: string;
  question: string;
  project: ProjectContext;
  references?: readonly RagSearchHit[];
}

/** `RagQaService.ask` の戻り値。controller で AIUsage 記録 + レスポンス整形に使う。 */
export interface AskResult {
  userMessage: RagQaMessage;
  assistantMessage: RagQaMessage;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/** セッション + メッセージのまとまり(GET セッション詳細の戻り値)。 */
export interface SessionWithMessages {
  session: RagQaSession;
  messages: RagQaMessage[];
}

/**
 * RAG_QA(過去 ProjectDocument を参照した壁打ち、ADR-005 Day 27 改訂)。
 *
 * セッション + メッセージを DB 永続化することで「壁打ちログを資産化」(§1 提供価値の筆頭)を直接実現。
 * 直近 N=10 ターンを Anthropic API `messages` として送り、応答は Sonnet 4 の自由文(Tool Use なし)。
 * RAG 検索は controller 側で行い、`references` として注入する(DRAFT_GEN と同じ責務分担)。
 */
@Injectable()
export class RagQaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
  ) {}

  /** 新しいセッションを作成する。 */
  async createSession(input: {
    tenantId: string;
    projectId: string;
    userId: string;
    title: string;
  }): Promise<RagQaSession> {
    return this.prisma.ragQaSession.create({
      data: {
        tenantId: input.tenantId,
        projectId: input.projectId,
        createdById: input.userId,
        title: input.title,
      },
    });
  }

  /** 指定プロジェクト配下のセッション一覧(新しい順)。 */
  async listSessions(tenantId: string, projectId: string): Promise<RagQaSession[]> {
    return this.prisma.ragQaSession.findMany({
      where: { tenantId, projectId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** セッション + メッセージ履歴(古い順)を取得。テナント越境は null を返して呼び出し側で 404 化。 */
  async getSessionWithMessages(
    tenantId: string,
    sessionId: string,
  ): Promise<SessionWithMessages | null> {
    const session = await this.prisma.ragQaSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) return null;
    const messages = await this.prisma.ragQaMessage.findMany({
      where: { sessionId, tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return { session, messages };
  }

  /**
   * セッションが指定テナント + 指定プロジェクト配下に存在することを軽量に検証(`projectId` のみ select)。
   * テナント越境 / クロスプロジェクト参照のどちらでも `NotFoundException`(404)。
   *
   * `ask` の事前ガードとして controller から呼ぶ用途(`getSessionWithMessages` だとメッセージ全件取得が
   * 不要に走るため、`ask` 内の history findMany と合わせて 2 重取得になる)。
   */
  async assertSessionInProject(
    tenantId: string,
    sessionId: string,
    projectId: string,
  ): Promise<void> {
    const session = await this.prisma.ragQaSession.findFirst({
      where: { id: sessionId, tenantId },
      select: { projectId: true },
    });
    if (!session || session.projectId !== projectId) {
      throw new NotFoundException();
    }
  }

  /**
   * セッションに質問を投げて回答を生成する。
   * 内部: 直近 N=10 ターン取得 → Anthropic API → user + assistant 同時保存(transaction)。
   *
   * 失敗時(セッション不在 / メッセージ数上限超過 / Anthropic API エラー)はメッセージを保存しない。
   */
  async ask(input: AskInput): Promise<AskResult> {
    // 注:セッション存在確認 + プロジェクト整合性チェックは controller 側で `assertSessionInProject`
    // 経由で実施済み(2 重 findFirst を避けるため、ADR-005 Day 27 改訂セルフレビューの中優先度 3 反映)。

    // 1. メッセージ数上限チェック(暴走防止、ADR-005 Day 27 改訂)
    const currentCount = await this.prisma.ragQaMessage.count({
      where: { sessionId: input.sessionId, tenantId: input.tenantId },
    });
    if (currentCount + 2 > RAG_QA_MAX_MESSAGES_PER_SESSION) {
      throw new BadRequestException(
        `セッションあたりのメッセージ数上限(${RAG_QA_MAX_MESSAGES_PER_SESSION})に達しました。新しいセッションを作成してください。`,
      );
    }

    // 2. 直近 N=10 ターン(= 最大 20 messages)を取得 → 古い順に並び替え
    const recentDesc = await this.prisma.ragQaMessage.findMany({
      where: { sessionId: input.sessionId, tenantId: input.tenantId },
      orderBy: { createdAt: 'desc' },
      take: RAG_QA_MAX_TURNS * 2,
    });
    const history = recentDesc.reverse();

    // 3. systemPrompt + 今回の user message を構築
    const systemPrompt = buildSystemPrompt(input.project);
    const referenceSection = formatReferenceSection(input.references, {
      usageHint:
        '以下は同じテナント内の過去ドキュメントです。回答の参考にしてください。引用するときは出典(タイトル)を明示してください。',
    });
    const userContent = [`# 質問\n${input.question}`, referenceSection].filter(Boolean).join('\n');

    const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history.map((m) => ({
        role: m.role === RagQaRole.USER ? ('user' as const) : ('assistant' as const),
        content: m.content,
      })),
      { role: 'user', content: userContent },
    ];

    // 4. Anthropic API 呼び出し(Sonnet 4、自由文応答)
    const res = await this.anthropic.client.messages.create({
      model: AI_MODEL_SONNET,
      max_tokens: RAG_QA_MAX_TOKENS,
      system: systemPrompt,
      messages: apiMessages,
    });
    const assistantText = extractTextContent(res, 'RAG_QA');

    // 5. user + assistant + session.updatedAt をトランザクションで同時保存
    //    (API 失敗時は何も保存されない = メッセージが片方だけ残る不整合を防ぐ)
    const [userMessage, assistantMessage] = await this.prisma.$transaction([
      this.prisma.ragQaMessage.create({
        data: {
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          role: RagQaRole.USER,
          content: input.question,
        },
      }),
      this.prisma.ragQaMessage.create({
        data: {
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          role: RagQaRole.ASSISTANT,
          content: assistantText,
          tokensIn: res.usage.input_tokens,
          tokensOut: res.usage.output_tokens,
          references:
            input.references && input.references.length > 0
              ? toReferenceSnapshot(input.references)
              : undefined,
        },
      }),
      this.prisma.ragQaSession.update({
        where: { id: input.sessionId, tenantId: input.tenantId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return {
      userMessage,
      assistantMessage,
      model: AI_MODEL_SONNET,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    };
  }
}

/**
 * RAG ヒットを `RagQaMessage.references` に保存するスナップショット形式に変換する。
 * 本文(content)は壁打ち履歴の参照表示には不要なので除外し、id / type / title / isSeed / distance のみ残す。
 * 参照先 ProjectDocument が後で編集・削除されても「この回答が何を見たか」 の履歴的事実を保つ。
 */
function toReferenceSnapshot(hits: readonly RagSearchHit[]): Prisma.InputJsonValue {
  return hits.map((h) => ({
    id: h.id,
    projectId: h.projectId,
    type: h.type,
    title: h.title,
    isSeed: h.isSeed,
    distance: h.distance,
  }));
}

function buildSystemPrompt(project: ProjectContext): string {
  return [
    AI_PERSONA_INTRO,
    '特定のプロジェクトについて、ユーザーと壁打ち(議論・相談・アイデア出し)を行います。',
    'プロジェクト情報・過去のドキュメント(参考)・これまでの対話履歴を踏まえ、',
    'ユーザーの質問に対して建設的な意見・提案・選択肢の整理を提供してください。',
    '推測で具体例を示すのは構いませんが、断定的に偽の事実を述べることは避けてください。',
    '回答は日本語の Markdown で、簡潔かつ実践的な内容を心がけてください。',
    '',
    '# プロジェクト情報',
    `- 名前: ${project.name}`,
    `- 概要: ${project.description?.trim() || '(未記入)'}`,
    `- 状態: ${project.status}`,
  ].join('\n');
}
