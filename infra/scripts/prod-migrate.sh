#!/usr/bin/env bash
# 本番 RDS に Prisma マイグレーションを適用する。
#
# やること(docs/runbooks/adr-015-release-checklist.md §2 をそのまま自動化):
#   1. SSM で NAT インスタンス経由のポートフォワードを張る(localhost:15432 → RDS)
#   2. マスターパスワードを Secrets Manager から読み、URL エンコードして DATABASE_URL を組む
#   3. migrate status で未適用を表示し、各 migration.sql の実行文に DROP INDEX が無いことを確認
#   4. 確認プロンプトの後に migrate deploy
#   5. HNSW インデックスと未適用 0 を確認
#   6. ポートフォワードを閉じる(異常終了時も trap で閉じる)
#
# 使い方:
#   pnpm db:deploy:prod            # 未適用を表示して確認後に適用
#   pnpm db:deploy:prod --status   # 表示だけ(読み取りのみ)
#
# 前提: aws CLI(SSO 済み)、session-manager-plugin、terraform(infra/prod の state に到達可能)、jq、psql
# パスワードは画面に出さない。

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$REPO/infra/prod"
LOCAL_PORT=15432
STATUS_ONLY=false
[ "${1:-}" = "--status" ] && STATUS_ONLY=true

for cmd in aws session-manager-plugin terraform jq psql pnpm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "必要なコマンドがありません: $cmd" >&2; exit 1; }
done

if lsof -ti:"$LOCAL_PORT" >/dev/null 2>&1; then
  echo "localhost:$LOCAL_PORT が既に使われています。別のポートフォワードが残っていないか確認してください。" >&2
  exit 1
fi

echo "== 接続情報を terraform output から取得"
NAT_ID=$(terraform -chdir="$TF_DIR" output -raw nat_instance_id)
RDS_HOST=$(terraform -chdir="$TF_DIR" output -raw rds_endpoint | cut -d: -f1)
MASTER_SECRET=$(terraform -chdir="$TF_DIR" output -raw rds_master_secret_arn)
echo "   host=$RDS_HOST"

echo "== ポートフォワードを張る(localhost:$LOCAL_PORT)"
SSM_LOG=$(mktemp)
aws ssm start-session --target "$NAT_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$RDS_HOST,portNumber=5432,localPortNumber=$LOCAL_PORT" \
  >"$SSM_LOG" 2>&1 &
SSM_PID=$!
# aws ssm は子プロセス session-manager-plugin にポートを持たせるため、親だけ kill すると
# ポートが残る。子 → 親 → それでも残った listener の順に閉じる。
cleanup() {
  pkill -P "$SSM_PID" 2>/dev/null || true
  kill "$SSM_PID" 2>/dev/null || true
  wait "$SSM_PID" 2>/dev/null || true
  lsof -ti:"$LOCAL_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
  rm -f "$SSM_LOG"
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  grep -q "Waiting for connections" "$SSM_LOG" 2>/dev/null && break
  kill -0 "$SSM_PID" 2>/dev/null || { echo "ポートフォワードの起動に失敗しました:" >&2; cat "$SSM_LOG" >&2; exit 1; }
  sleep 1
done
grep -q "Waiting for connections" "$SSM_LOG" || { echo "ポートフォワードが 30 秒以内に張れませんでした" >&2; cat "$SSM_LOG" >&2; exit 1; }

# パスワードは変数にだけ持ち、以降 echo しない。@uri で URL 予約文字をエスケープする(しないと P1013)。
DB_PASSWORD_RAW=$(aws secretsmanager get-secret-value --secret-id "$MASTER_SECRET" --query SecretString --output text | jq -r '.password')
DB_PASSWORD_URI=$(printf '%s' "$DB_PASSWORD_RAW" | jq -sRr '@uri')
export DATABASE_URL="postgresql://shipyard:${DB_PASSWORD_URI}@localhost:${LOCAL_PORT}/shipyard?schema=public&sslmode=require"
export PGPASSWORD="$DB_PASSWORD_RAW"
PSQL="psql host=localhost port=$LOCAL_PORT dbname=shipyard user=shipyard sslmode=require"

echo "== 本番の migrate status(読み取りのみ)"
STATUS_OUT=$(cd "$REPO" && pnpm --filter @shipyard/db exec prisma migrate status 2>&1 || true)
printf '%s\n' "$STATUS_OUT" | grep -v "^$" | grep -v "Environment variables\|schema loaded\|ERR_PNPM\|^undefined\|packages/db:" || true

PENDING=$(printf '%s\n' "$STATUS_OUT" | awk '/have not yet been applied/{f=1;next} /^To apply/{f=0} f && NF' | tr -d ' ')
if [ -z "$PENDING" ]; then
  echo "== 未適用なし。終了します。"
  exit 0
fi

echo "== 未適用 $(printf '%s\n' "$PENDING" | wc -l | tr -d ' ') 本の実行文を確認(DROP INDEX が混入していないこと)"
for m in $PENDING; do
  f="$REPO/packages/db/prisma/migrations/$m/migration.sql"
  [ -f "$f" ] || { echo "ファイルがありません: $f" >&2; exit 1; }
  echo "--- $m"
  grep -E '^(ALTER|CREATE|DROP)' "$f" | cut -c1-110
  if grep -E '^DROP INDEX' "$f" | grep -q hnsw; then
    echo "!! HNSW インデックスの DROP が実行文にあります。除去してから再実行してください。" >&2
    exit 1
  fi
done

$STATUS_ONLY && { echo "== --status のため適用しません。"; exit 0; }

printf '\n本番 DB に上記 %s 本を適用します。よろしいですか? [y/N] ' "$(printf '%s\n' "$PENDING" | wc -l | tr -d ' ')"
read -r ANSWER
[ "$ANSWER" = "y" ] || { echo "中止しました。"; exit 1; }

echo "== migrate deploy"
(cd "$REPO" && pnpm --filter @shipyard/db exec prisma migrate deploy 2>&1 | grep -v "Environment variables\|schema loaded")

echo "== 適用後の確認"
$PSQL -t -A -F' | ' <<'SQL'
SELECT 'HNSW インデックス', count(*) FROM pg_indexes WHERE indexname = 'ProjectDocument_embedding_hnsw_idx';
SELECT '未完了のマイグレーション', count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL;
SQL

echo "== shipyard_app に権限の無いテーブル(無ければ空)"
MISSING=$($PSQL -t -A -c "
SELECT t.tablename FROM pg_tables t
WHERE t.schemaname = 'public' AND t.tablename <> '_prisma_migrations'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges p
    WHERE p.table_schema = 'public' AND p.table_name = t.tablename AND p.grantee = 'shipyard_app'
  )
ORDER BY 1;")
if [ -n "$MISSING" ]; then
  echo "!! 次のテーブルに shipyard_app の権限がありません(production-cutover.md §6.5 を確認):" >&2
  printf '%s\n' "$MISSING" >&2
  exit 1
fi
echo "   すべてのテーブルに権限あり"

echo "== 完了"
