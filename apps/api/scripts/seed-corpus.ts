/**
 * ADR-008(RAG コーパス戦略)— 運営キュレーション seed コーパスを `SEED_PUBLIC` テナントに投入する CLI スクリプト。
 *
 * 用途:
 *   `apps/api/src/onboarding/seed-corpus/*.md` を読み込み、`SEED_PUBLIC` テナントの `prj_seed_templates`
 *   プロジェクトに `ProjectDocument` として投入する。投入後に EmbeddingService で embedding を生成する。
 *
 * 使い方:
 *   pnpm --filter @shipyard/api seed-corpus:apply
 *
 * 前提:
 *   - migration `20260519160000_add_seed_public_tenant` が適用済(`SEED_PUBLIC` Tenant + System User +
 *     `prj_seed_templates` Project が存在)。なければ early-exit
 *   - 環境変数 `OPENAI_API_KEY` が `apps/api/.env.local` に設定済(embedding 生成のため)
 *
 * 冪等性:
 *   同 (projectId, type, title) の `ProjectDocument` が既に存在(`deletedAt IS NULL`)すればスキップする。
 *   何度叩いても安全。コンテンツを更新したい場合は schema の append-only ポリシーに従い、ファイル名(title)を
 *   変えて投入するか、別途 `DocumentsService.edit` を使う(将来的な運用、現状は新規 INSERT のみ)。
 *
 * Markdown ファイル形式:
 *   ---
 *   type: README | LANDING_PAGE | RELEASE_BLOG | ...   (DocType enum 値、`OTHER` 以外推奨)
 *   title: (人間向け表示名)
 *   source_url: (任意、OSS 引用時に必須)
 *   license: (任意、source_url とセットで必須。MIT / Apache-2.0 / BSD-3 など)
 *   original_author: (任意、source_url とセットで必須)
 *   ---
 *
 *   # 本文 Markdown
 *
 * ADR-008 ライセンス遵守:
 *   `source_url` / `license` / `original_author` の 3 つは all-or-nothing。1 つでも指定すれば残り 2 つも必須。
 *   指定されていた場合、本文末尾に attribution ブロックを自動付与して投入する。
 *   これにより RAG 検索で content を取得した先の Sonnet 4 context にも attribution が乗る(license 遵守 +
 *   生成物が引用元を明示する設計)。
 *
 * 失敗仕様:
 *   - frontmatter 不正 / 未知 DocType は スクリプト全体を停止(stderr + exit 1)
 *   - OpenAI API 失敗は EmbeddingService 内で握りつぶし(`embedding IS NULL` のまま挿入される)
 *     → `pnpm --filter @shipyard/api backfill:embeddings _seed-public usr_seed_system` で回収
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { DocType } from '@shipyard/db';

import { AIUsageService } from '../src/ai/ai-usage.service';
import { EmbeddingService } from '../src/ai/embedding.service';
import { OpenAIModule } from '../src/ai/openai.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    OpenAIModule,
  ],
  providers: [EmbeddingService, AIUsageService],
})
class SeedCorpusModule {}

/** ADR-008 / migration 20260519160000 と一致(変更時は migration 側も同時に直す)。 */
const SEED_PUBLIC_TENANT_ID = 'SEED_PUBLIC';
const SEED_TEMPLATES_PROJECT_ID = 'prj_seed_templates';
const SEED_USER_ID = 'usr_seed_system';
const SEED_CORPUS_DIR = join(__dirname, '..', 'src', 'onboarding', 'seed-corpus');

interface ParsedMarkdown {
  type: DocType;
  title: string;
  content: string;
}

/** `---` で挟まれた frontmatter を簡易パース(YAML パーサは引かない、必要なキーのみ取り出す)。
 *  source_url / license / original_author が指定されていた場合は本文末尾に attribution を自動付与する。 */
function parseMarkdown(text: string, filename: string): ParsedMarkdown {
  // Windows の CRLF を LF に正規化してからパース(`\r` 混入で title が壊れるのを防ぐ)
  const normalized = text.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(
      `Invalid frontmatter format in ${filename} (expected "---" delimited block at top)`,
    );
  }
  const frontmatter = match[1];
  let content = match[2].trim();
  const typeMatch = frontmatter.match(/^type:\s*(\S+)\s*$/m);
  const titleMatch = frontmatter.match(/^title:\s*(.+?)\s*$/m);
  if (!typeMatch || !titleMatch) {
    throw new Error(`type or title missing in frontmatter of ${filename}`);
  }
  const typeRaw = typeMatch[1];
  if (!(typeRaw in DocType)) {
    throw new Error(`Invalid DocType "${typeRaw}" in ${filename}`);
  }

  // ADR-008 license attribution: 3 つは all-or-nothing
  const sourceUrl = frontmatter.match(/^source_url:\s*(.+?)\s*$/m)?.[1];
  const license = frontmatter.match(/^license:\s*(.+?)\s*$/m)?.[1];
  const originalAuthor = frontmatter.match(/^original_author:\s*(.+?)\s*$/m)?.[1];
  const attributionFields = [sourceUrl, license, originalAuthor];
  const presentCount = attributionFields.filter(Boolean).length;
  if (presentCount !== 0 && presentCount !== 3) {
    throw new Error(
      `${filename}: source_url / license / original_author は all-or-nothing(全部指定するか全部省略するか)。` +
        `現在 ${presentCount}/3 が指定されている。`,
    );
  }
  if (presentCount === 3) {
    content += [
      '',
      '',
      '---',
      '',
      `> **Source:** ${sourceUrl}`,
      `> **License:** ${license}`,
      `> **Original Author:** ${originalAuthor}`,
      '> Reproduced as part of the Shipyard seed corpus (ADR-008).',
    ].join('\n');
  }

  return {
    type: DocType[typeRaw as keyof typeof DocType],
    title: titleMatch[1],
    content,
  };
}

async function main(): Promise<void> {
  const logger = new Logger('seed-corpus:apply');
  const app = await NestFactory.createApplicationContext(SeedCorpusModule, { logger });

  const prisma = app.get(PrismaService);
  const embeddings = app.get(EmbeddingService);

  // migration 適用前なら early-exit(運用ミス防止)
  const seedProject = await prisma.project.findFirst({
    where: { id: SEED_TEMPLATES_PROJECT_ID, tenantId: SEED_PUBLIC_TENANT_ID },
    select: { id: true },
  });
  if (!seedProject) {
    logger.error(
      `Seed project not found (id=${SEED_TEMPLATES_PROJECT_ID}, tenantId=${SEED_PUBLIC_TENANT_ID}). ` +
        'Apply migration first: pnpm --filter @shipyard/db migrate:dev',
    );
    await app.close();
    process.exit(1);
  }

  const files = readdirSync(SEED_CORPUS_DIR).filter((f) => f.endsWith('.md'));
  logger.log(`Found ${files.length} markdown files in seed-corpus directory`);

  let inserted = 0;
  let skipped = 0;
  let embedded = 0;

  for (const file of files) {
    const text = readFileSync(join(SEED_CORPUS_DIR, file), 'utf-8');
    let parsed: ParsedMarkdown;
    try {
      parsed = parseMarkdown(text, file);
    } catch (e) {
      logger.error(e instanceof Error ? e.message : String(e));
      await app.close();
      process.exit(1);
    }

    // 冪等: 同 (projectId, type, title) が既に存在(未削除)ならスキップ
    const existing = await prisma.projectDocument.findFirst({
      where: {
        tenantId: SEED_PUBLIC_TENANT_ID,
        projectId: SEED_TEMPLATES_PROJECT_ID,
        type: parsed.type,
        title: parsed.title,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      logger.log(`[skip] ${file} (already exists: ${existing.id})`);
      skipped++;
      continue;
    }

    // 同 (projectId, type) で MAX(version) + 1 を採番(`@@unique([projectId, type, version])` 制約のため、
    // 同 type 複数件は version をインクリメントして衝突を避ける。soft delete 済み行も MAX に含める方針は
    // DocumentsService.appendNewVersion と同じ:version 欠番を許して再利用しない)
    const latest = await prisma.projectDocument.findFirst({
      where: {
        tenantId: SEED_PUBLIC_TENANT_ID,
        projectId: SEED_TEMPLATES_PROJECT_ID,
        type: parsed.type,
      },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const document = await prisma.projectDocument.create({
      data: {
        tenantId: SEED_PUBLIC_TENANT_ID,
        projectId: SEED_TEMPLATES_PROJECT_ID,
        type: parsed.type,
        title: parsed.title,
        content: parsed.content,
        version: nextVersion,
        createdById: SEED_USER_ID,
      },
      select: { id: true, title: true, content: true },
    });
    logger.log(`[insert] ${file} -> ProjectDocument(${document.id}, type=${parsed.type})`);
    inserted++;

    const ok = await embeddings.upsertForDocument({
      tenantId: SEED_PUBLIC_TENANT_ID,
      userId: SEED_USER_ID,
      documentId: document.id,
      title: document.title,
      content: document.content,
    });
    if (ok) embedded++;
  }

  logger.log(`Done: inserted=${inserted}, skipped=${skipped}, embedded=${embedded}`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
