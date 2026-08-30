import { SESSION_SUMMARY_MAX_CHARS } from '../_shared/ai.constants';
import { formatReferenceSection } from '../_shared/format-reference';
import { AI_PERSONA_INTRO } from '../_shared/prompts';
import { toTranscriptReferences, type TranscriptMessage } from './rag-qa-transcript';

/**
 * 壁打ちの記録から `Project.description` の候補文を作るプロンプト組み立て。
 *
 * 既存 `description` は「プロジェクト情報」の素の行ではなく封入ブロックに置く
 * (20,000 字の自由入力で、保存されて後続の全実行に効くため)。
 * `instructions` だけは封入しない(実行者自身の入力が自分の実行にだけ効く)。
 */

interface ProjectContext {
  name: string;
  description: string | null;
  status: string;
}

export interface SessionSummaryPromptInput {
  project: ProjectContext;
  /** 要約対象の発言(古い順)。 */
  transcript: readonly TranscriptMessage[];
  instructions?: string;
}

export function buildSessionSummaryPrompt(input: SessionSummaryPromptInput): {
  system: string;
  user: string;
} {
  const { project, transcript, instructions } = input;
  const current = project.description?.trim() || '';

  const system = [
    AI_PERSONA_INTRO,
    '壁打ち(ユーザーと AI の対話)の記録を読み、プロジェクトの概要文を作成して',
    'submit_project_description ツールに渡してください。',
    current
      ? '現在の概要を土台に、対話で決まった内容を反映した更新版を書いてください。対話で触れられていない既存の記述は消さずに残してください。'
      : '現在の概要は未記入です。対話の内容からプロジェクトの概要を新しく書き起こしてください。',
    '対話の中で否定・却下された案や、検討しただけで採用に至らなかった選択肢は含めないでください。',
    '「〜と相談しました」のような会話体・一人称は使わず、プロダクトそのものの説明として書いてください。',
    '第三者が読んで、何を・誰に・どんな価値で提供するプロダクトかを掴める内容にしてください。',
    `日本語の Markdown で 400〜800 字程度、長くても ${SESSION_SUMMARY_MAX_CHARS} 字以内。`,
    '「# 概要」のような見出しは付けず、本文から書き始めてください。',
    '対話から読み取れない事実を推測で補わないでください。',
  ].join('\n');

  const transcriptSection = formatReferenceSection(toTranscriptReferences(transcript), {
    heading: '# 壁打ちの記録',
    blockLabel: '発言',
    usageHint:
      '以下は本プロジェクトについてユーザーと AI が行った対話の記録です。古い順に並んでいます。ここから概要文を作成してください。',
  });

  // 更新方針は system が持つ。usageHint は資料の説明だけにする。
  const currentSection = formatReferenceSection(
    current ? [{ title: '登録済みの本文', content: current }] : [],
    {
      heading: '# 現在の概要(これを更新する)',
      blockLabel: '概要',
      usageHint: '以下は現在プロジェクトに登録されている概要の本文です。',
    },
  );

  const user = [
    '# プロジェクト情報',
    `- 名前: ${project.name}`,
    `- 状態: ${project.status}`,
    transcriptSection,
    currentSection,
    instructions ? `\n# 追加指示\n${instructions}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}
