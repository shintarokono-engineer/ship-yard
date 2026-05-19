-- ADR-008: RAG コーパス戦略 — SEED_PUBLIC テナント + システムユーザー + Sample Templates プロジェクトを作成。
-- ここに投入されるドキュメントは、運営キュレーションコーパスとして全テナント横断で RAG 検索の対象になる。
-- (RagSearchService.searchSimilar が WHERE "tenantId" IN (callerTenantId, SEED_PUBLIC) を使う)
--
-- 冪等(ON CONFLICT DO NOTHING)にしてあるので、再適用しても副作用なし。

-- システムユーザー(SEED_PUBLIC の所有者として使う、Clerk 認証経路では到達不可能な擬似 ID)
INSERT INTO "User" ("id", "clerkUserId", "email", "name", "createdAt")
VALUES ('usr_seed_system', 'system_seed_no_auth', 'system@shipyard.local', 'Shipyard System', NOW())
ON CONFLICT DO NOTHING;

-- SEED_PUBLIC テナント(運営所有、全テナント横断 RAG ソース、ADR-008)
INSERT INTO "Tenant" ("id", "slug", "name", "plan", "ownerId", "createdAt")
VALUES ('SEED_PUBLIC', '_seed-public', 'Shipyard Sample Templates', 'FREE', 'usr_seed_system', NOW())
ON CONFLICT DO NOTHING;

-- システムユーザーを SEED_PUBLIC の OWNER として TenantMember 登録
-- (Tenant.ownerId の不変条件「OWNER として TenantMember に登録されている」を満たす、ADR-008)
INSERT INTO "TenantMember" ("tenantId", "userId", "role", "joinedAt")
VALUES ('SEED_PUBLIC', 'usr_seed_system', 'OWNER', NOW())
ON CONFLICT DO NOTHING;

-- Sample Templates プロジェクト(seed-corpus CLI で投入する ProjectDocument の親 FK)
INSERT INTO "Project" ("id", "tenantId", "name", "description", "status", "createdById", "createdAt", "updatedAt")
VALUES (
  'prj_seed_templates',
  'SEED_PUBLIC',
  'Sample Templates',
  '個人開発者向けの README / LP サンプルテンプレート集(ADR-008、運営キュレーション)',
  'LAUNCHED',
  'usr_seed_system',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
