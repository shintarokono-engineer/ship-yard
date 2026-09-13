# ADR-015 リリース手順: 無料公開アイデア検証ツール `/check`

**対象**: `/check` の本番反映(2026-09-13 実施済み)と、以後の API リリース全般に効く順序の記録。
**関連**: [ADR-015](../adr/015-public-idea-check-acquisition.md) / [`production-cutover.md`](production-cutover.md) §6 / [`adr-012-release-checklist.md`](adr-012-release-checklist.md) §8(F20、同じ EventBridge 経路)

## 0. 前提 — **main への push は本番リリースと同義**

| 対象                                            | 何が起きるか                                           |
| ----------------------------------------------- | ------------------------------------------------------ |
| `apps/api/**` / `packages/**` の変更を含む push | `deploy.yml` が **自動で** App Runner へデプロイする   |
| `apps/web/**` の変更を含む push                 | Vercel が **自動で** Production に配信する             |
| `packages/db/prisma/migrations/**`              | **何も起きない**。本番 DB のマイグレーションは手動(§2) |

つまり **マイグレーションを含む変更は、push の前に本番 DB へ適用しておく**必要がある。逆順にすると、新テーブルを参照するコードが本番に乗り、該当機能が 500 になる(2026-09-13 に実際に起きた。§8)。

`deploy.yml` はこの事故を防ぐため、push 起動時に「App Runner で稼働中のコミット以降に追加されたマイグレーション」があればデプロイを止める(§8.2)。**止まったら §2 を済ませてから `workflow_dispatch` で再実行する。**

## 1. 実行順序

```
① 本番 DB の未適用マイグレーションを確認(migrate status、読み取りのみ)
② マイグレーションを適用(migrate deploy)          ← push より前
③ 新しいシークレットを Secrets Manager に投入        ← terraform apply より前
④ terraform plan → apply(EventBridge / App Runner の secret 参照)
⑤ main へ push(自動デプロイ)or workflow_dispatch で手動デプロイ
⑥ スモークテスト
```

## 2. DB マイグレーション

本番 RDS は VPC 内。`production-cutover.md` §6.2 の SSM ポートフォワードを張り、マスターパスワードは Secrets Manager から読む(画面に出さない)。

```bash
# ターミナル 1: ポートフォワード(開いたままにする)
cd infra/prod
NAT_ID=$(terraform output -raw nat_instance_id)
RDS_HOST=$(terraform output -raw rds_endpoint | cut -d: -f1)
aws ssm start-session --target "$NAT_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$RDS_HOST,portNumber=5432,localPortNumber=15432"
```

```bash
# ターミナル 2: パスワードは URL エンコードする(記号を含むため。しないと P1013 になる)
MASTER_SECRET=$(terraform -chdir=infra/prod output -raw rds_master_secret_arn)
DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id "$MASTER_SECRET" \
  --query SecretString --output text | jq -r '.password|@uri')
export DATABASE_URL="postgresql://shipyard:${DB_PASSWORD}@localhost:15432/shipyard?schema=public&sslmode=require"

pnpm --filter @shipyard/db exec prisma migrate status   # 未適用があると exit 1(正常)
```

- [ ] 未適用の一覧が想定どおり。**想定より多い場合は、過去のリリースで適用漏れがある**(2026-09-13 は 3 本の想定に対し 4 本あった)
- [ ] 各 migration.sql の実行文に `DROP INDEX "ProjectDocument_embedding_hnsw_idx"` が**無い**(コメント行は可)

```bash
grep -E "^(ALTER|CREATE|DROP)" packages/db/prisma/migrations/<name>/migration.sql
```

```bash
pnpm --filter @shipyard/db exec prisma migrate deploy
```

> **適用済みマイグレーションの checksum 不一致は `migrate deploy` を止めない。** 2026-09-13 に使い捨て DB で再現して確認した(`deploy` は未適用分を流すだけで、適用済みの checksum を検証しない)。`migrate dev` とは挙動が違う。

適用後の確認(`psql` はマスターユーザーで):

```sql
SELECT tablename FROM pg_tables WHERE tablename IN ('<新テーブル>');
SELECT count(*) FROM pg_indexes WHERE indexname = 'ProjectDocument_embedding_hnsw_idx';  -- 1
SELECT table_name, string_agg(privilege_type, ',') FROM information_schema.table_privileges
 WHERE grantee = 'shipyard_app' AND table_name IN ('<新テーブル>') GROUP BY table_name;
SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL;  -- 0
```

- [ ] HNSW インデックスが残っている
- [ ] **`shipyard_app` に SELECT / INSERT / UPDATE / DELETE がある**(無いと「テーブルはあるのに permission denied」になる)

## 3. Secrets Manager(`PUBLIC_CHECK_IP_SALT`)

`put-secret-value` は JSON を丸ごと置き換えるため、既存キーを壊していないことを検証してから書く(F20 と同じ手順)。

```bash
SALT=$(openssl rand -hex 32)
SECRET_ID=$(aws secretsmanager list-secrets \
  --query "SecretList[?starts_with(Name,'shipyard-prod-app-config')].Name | [0]" --output text)
CURRENT=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text)
UPDATED=$(printf '%s' "$CURRENT" | jq --arg v "$SALT" '.PUBLIC_CHECK_IP_SALT = $v')
printf '%s' "$UPDATED" | jq -e --argjson c "$CURRENT" 'del(.PUBLIC_CHECK_IP_SALT) == $c' >/dev/null \
  || { echo "既存キーが変化している。中止"; exit 1; }
aws secretsmanager put-secret-value --secret-id "$SECRET_ID" --secret-string "$UPDATED"
```

- [ ] キー数が 1 増えた(2026-09-13: 11 → 12)
- [ ] 値は画面に出していない

> 未設定でもアプリは起動する(IP レート制限だけが無効になる fail open)。ただし本番では必ず入れる。

## 4. Terraform

```bash
terraform -chdir=infra/prod plan -out=/tmp/adr015.tfplan
terraform -chdir=infra/prod apply /tmp/adr015.tfplan
```

2026-09-13 の実績: **3 added(api_destination / rule / target), 2 changed(App Runner in-place, IAM policy), 0 destroyed**。所要 3 分 40 秒(App Runner の更新待ち)。

- [ ] `0 to destroy`
- [ ] App Runner が `update in-place` で、差分が `runtime_environment_secrets` への `PUBLIC_CHECK_IP_SALT` 追加のみ
- [ ] apply 後の App Runner: `Status = RUNNING`、シークレットキーに `PUBLIC_CHECK_IP_SALT`、**イメージタグが変わっていない**

EventBridge Connection のトークンは F20 のものを共用するため、**追加投入は不要**。

## 5. デプロイ

push で自動発火していない場合(ガードで止まった場合を含む):

```bash
gh workflow run deploy.yml --ref main
gh run watch
```

- [ ] App Runner のイメージタグが main HEAD の SHA になった

Web(Vercel)は push 時に自動配信済み。`SITE_URL` は設定済みで、`https://neorie.com/check` の JSON-LD / OG の `url` が本番ドメインになっていることで確認できる。

## 6. スモークテスト

課金なし(順に 404 / 401 / 401 / 400 / 401 が期待値):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.neorie.com/public/idea-checks/does-not-exist
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.neorie.com/internal/jobs/public-check-purge
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.neorie.com/idea-checks/x/claim
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' \
  -d '{"ideaText":"短い"}' https://api.neorie.com/public/idea-checks
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.neorie.com/internal/jobs/trial-reminders
```

課金あり(¥2 程度): ブラウザで `https://neorie.com/check` から 1 回実行し、結果ページへ遷移することを確認する。**共有と引き換えは押さない**(引き換えは実際にワークスペースと 5 軸診断を作り、10cr 消費する)。

```bash
ID=<結果 URL の ID>
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://neorie.com/check/$ID/opengraph-image  # 200 image/png
curl -s https://neorie.com/check/$ID | grep -o 'name="robots" content="[^"]*"'                          # noindex, nofollow
```

```sql
SELECT id, "totalScore", "tokensIn", "tokensOut", "costJpy", "ipHash" IS NOT NULL FROM "PublicIdeaCheck";
SELECT date, count FROM "PublicCheckUsage";
```

- [ ] `costJpy` が実測レンジ(¥1.4〜2.2)内
- [ ] `ipHash` が入っている(ソルトが効いている証拠)
- [ ] `PublicCheckUsage` の当日行が増えている

## 7. ロールバック

**API**: 直前の成功デプロイを再実行する。イメージは ECR に残っているのでビルドし直しになるだけで、6 分ほどで戻る。

```bash
gh run list --workflow=deploy.yml --limit 5     # 直前の success の run ID を見る
gh run rerun <run-id>
```

**DB**: マイグレーションは additive のみ(CREATE / ADD COLUMN / ADD VALUE)なので、コードを戻せば新テーブルは参照されなくなる。DROP は急がない。

**Web**: Vercel の Deployments から直前のデプロイを Promote する。

## 8. 2026-09-13 の実績と障害

### 8.1 時系列(UTC)

| 時刻  | 出来事                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------- |
| 06:04 | main へ push。`deploy.yml` が自動発火                                                              |
| 06:09 | マイグレーション未適用に気付き、直前の成功デプロイ(08-30)を `gh run rerun`                         |
| 06:10 | **元のデプロイが完了し、新イメージが本番に乗る**(診断・検証の起動が `AiJob` 不在で 500 になる状態) |
| 06:15 | 巻き戻し完了(旧イメージ `4f27743`)                                                                 |
| 06:20 | 使い捨て DB で `migrate deploy` の checksum 挙動を確認                                             |
| 06:30 | 本番に 4 本適用                                                                                    |
| 06:35 | `PUBLIC_CHECK_IP_SALT` 投入、`terraform apply`                                                     |
| 06:45 | `workflow_dispatch` で新イメージ `be35382` をデプロイ                                              |
| 06:55 | スモークテスト完了(1 回実行 ¥1.44、スコア 63/100)                                                  |

破損イメージが本番にいた時間は **約 6 分**。流入がほぼ 0 の段階だったため実害は確認されていない。

### 8.2 再発防止

`deploy.yml` に、push 起動時のガードを追加した。App Runner で稼働中のイメージタグ(= コミット SHA)と HEAD の間で `packages/db/prisma/migrations/` に追加があれば、**push 起動のデプロイは失敗させる**。マイグレーションを適用したうえで `workflow_dispatch` から `migrations_applied=true` を付けて実行する。

これは「適用したか」を機械的に検証するものではない(GitHub Actions から本番 RDS へは届かない)。**人が §2 を済ませたと宣言する**ためのゲートであり、宣言なしに自動で乗ることを防ぐ。

### 8.3 副産物

- `20260830171500_add_description_sync_feature` が 08-30 から未適用だった。F16(壁打ち → 概要反映)は `DESCRIPTION_SYNC` の enum 値が無いため本番で失敗していた可能性が高い。今回の適用で解消
- `migrate deploy` は適用済みマイグレーションの checksum を検証しない(`implementation-rules.md` の「未検証」を解消)
