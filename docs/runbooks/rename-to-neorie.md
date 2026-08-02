# ドメイン / ブランド名の移行 runbook(Shipyard → Neorie)

**目的**: `useshipyard.dev` / ブランド名 `Shipyard` を、`neorie.com` / `Neorie` に移行する。
**前提**: 本番環境は Phase 1〜10 まで構築済み(App Runner `RUNNING`、`/health` 200)。**ユーザー 0、公開 LP 0 件**。

---

## なぜ移行するか

`Shipyard` は開発者向けサービスとして**既に複数の同名プロダクトが存在**する。

| サイト         | プロダクト                                                | 距離               |
| -------------- | --------------------------------------------------------- | ------------------ |
| shipyardhq.dev | プロダクトのローンチ・ディレクトリ(**indie makers 向け**) | **訴求層が重なる** |
| shipyard.build | Ephemeral Environments。**資金調達済み企業**              | 知名度が高い       |
| ship-yard.dev  | 技術面接プラットフォーム                                  | 別領域             |
| shipyard.io    | 2013 年登録                                               | 不明               |

SEO で埋もれ、商標リスクも残る。**ユーザー 0 の今が最も安く変えられるタイミング**のため実施する。

`Neorie` は古代ギリシャ語 **νεώριον(neōrion)= 造船所**に由来する造語。IT / SaaS に同名プロダクトは存在せず(検索で確認済)、商標も確認済み。

---

## 移行の全体像

**コード内に `useshipyard.dev` の文字列は 1 箇所も無い**(実測)。ドメインは `terraform.tfvars` と外部サービス設定にのみ存在するため、**ドメイン変更によるコード修正は不要**。

作業は次の 3 系統に分かれる。

```
A. ドメイン(neorie.com の取得と各サービスの再設定)    ← DNS 待ちがある
B. ブランド名(コードの表示文字列)                      ← 独立して進められる
C. AWS リソース名                                      ← 変更しない(後述)
```

### C. AWS リソース名は変更しない

`shipyard-prod-*` / DB 名 `shipyard` / DB ユーザー `shipyard_app` / ECR `shipyard/api` は**そのまま残す**。

- **外部から見えない**(ユーザーの目に触れない)
- 変更すると **RDS / App Runner / ECR をすべて作り直す**ことになり、コスト・時間・リスクが跳ね上がる
- `var.project = "shipyard"` を変えると全リソースが再作成される

将来どうしても揃えたくなったら、その時点で新規環境を建てて移行する。

---

## 所要時間

| 系統          | 実作業 | 待ち時間                                |
| ------------- | ------ | --------------------------------------- |
| A. ドメイン   | 2 時間 | **DNS 浸透 + 各サービスの検証で数時間** |
| B. ブランド名 | 1 時間 | —                                       |

**A の Step 2(DNS 委任)を最初に着手**し、待っている間に B を進めるのが効率的。

---

## A. ドメイン移行

### A-1. `neorie.com` を取得する

Route53 で取得する(年 $16)。連絡先は `useshipyard.dev` と同じものを使う。

```bash
aws route53domains check-domain-availability --domain-name neorie.com --region us-east-1
```

- [ ] 取得した(反映まで数分〜数十分)

> ⚠ Route53 で取得すると**ホストゾーンが自動作成される**。Terraform の `aws_route53_zone.main` と二重になるため、A-3 で import する。

### A-2. 旧ドメインの自動更新を切る(済)

```bash
aws route53domains disable-domain-auto-renew --domain-name useshipyard.dev --region us-east-1
```

- [x] **2026-08-02 実施済**。`useshipyard.dev` は 2027-07-25 に自然失効する。それまでは使えるので、移行中も現行環境が動き続ける

### A-3. ホストゾーンを Terraform に取り込む

```bash
aws route53 list-hosted-zones \
  --query "HostedZones[?Name=='neorie.com.'].[Id,Name]" --output text
```

**先に `terraform.tfvars` を書き換えてから** import する(import は変数を評価するため)。

```hcl
# infra/prod/terraform.tfvars
domain_name = "neorie.com"
mail_from   = "Neorie <noreply@neorie.com>"
```

```bash
cd ~/projects/ship-yard/infra/prod
```

```bash
terraform state rm aws_route53_zone.main
```

```bash
terraform import aws_route53_zone.main <新しい ZONE_ID>
```

- [ ] `Import successful!`

> `state rm` で旧ゾーンを Terraform の管理から外す。**旧ゾーン自体は AWS に残る**ので、移行完了まで現行環境は動き続ける。

### A-4. Clerk の production ドメインを変更する

**ここが最も重い。** Clerk はドメイン変更に伴い証明書と OAuth をすべて張り直す。

1. Clerk Dashboard(Production)→ ドメイン設定 → `neorie.com` に変更
2. 提示された CNAME(5 件程度)を Route53 に登録する

```bash
cd ~/projects/ship-yard/infra/prod
ZONE_ID=$(terraform output -raw route53_zone_id)

add_record() {
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
    --change-batch "$(jq -n --arg n "$1" --arg t "$2" --arg v "$3" \
      '{Changes:[{Action:"UPSERT",ResourceRecordSet:{Name:$n,Type:$t,TTL:300,ResourceRecords:[{Value:$v}]}}]}')"
}
```

```bash
add_record "clerk.neorie.com"           CNAME "<Clerk が表示した値>"
add_record "accounts.neorie.com"        CNAME "<Clerk が表示した値>"
add_record "clkmail.neorie.com"         CNAME "<Clerk が表示した値>"
add_record "clk._domainkey.neorie.com"  CNAME "<Clerk が表示した値>"
add_record "clk2._domainkey.neorie.com" CNAME "<Clerk が表示した値>"
```

3. Clerk で **Verify** → 全レコードが緑になるまで待つ
4. **API Keys を再確認**(ドメイン変更でキーが変わる場合がある)
5. **⚠ OAuth を設定し直す**
   - Clerk が新しい **Authorized Redirect URI** を提示する
   - **Google Cloud Console** の OAuth クライアントで、承認済みリダイレクト URI を新しい値に差し替える
   - **GitHub OAuth App** の Authorization callback URL も同様
6. **Paths** を `https://neorie.com/sign-in` 等に更新
7. **Sessions → Multi-session handling が OFF** のままか確認

- [ ] ドメイン検証が完了した
- [ ] **OAuth(Google / GitHub)のリダイレクト URI を更新した**
- [ ] Paths を更新した

```bash
curl -s "https://clerk.neorie.com/v1/environment?__clerk_api_version=2024-10-01&_clerk_js_version=5.0.0" \
  | jq '{env: .display_config.instance_environment_type, home: .display_config.home_url, social: (.user_settings.social | to_entries | map(select(.value.enabled)) | map(.key))}'
```

### A-5. Resend の送信ドメインを再検証する

1. Resend → Domains → **Add Domain** → `neorie.com`
2. **Region は東京(ap-northeast-1)**を選ぶ(現行と同じ)
3. 提示された MX / TXT を Route53 に登録

TXT は Route53 ではダブルクォートで囲む必要がある。255 文字を超える場合は分割する。

```bash
add_txt() {
  local val="$2" out="" i=0
  while [ "$i" -lt "${#val}" ]; do
    out="${out}\"${val:$i:255}\" "
    i=$((i + 255))
  done
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
    --change-batch "$(jq -n --arg n "$1" --arg v "${out% }" \
      '{Changes:[{Action:"UPSERT",ResourceRecordSet:{Name:$n,Type:"TXT",TTL:300,ResourceRecords:[{Value:$v}]}}]}')"
}
```

```bash
add_record "send.neorie.com" MX "10 feedback-smtp.ap-northeast-1.amazonses.com"
add_txt    "send.neorie.com" "v=spf1 include:amazonses.com ~all"
add_txt    "resend._domainkey.neorie.com" "<Resend が表示した DKIM 値>"
add_txt    "_dmarc.neorie.com" "v=DMARC1; p=none;"
```

- [ ] Resend が `Verified` になった
- [ ] **送信専用 API キーは変更不要**(ドメインに紐づかない)

### A-6. AWS を apply する

`domain_name` を変えたので、App Runner のカスタムドメインと証明書が張り替わる。

```bash
cd ~/projects/ship-yard/infra/prod && terraform plan
```

plan で確認する点:

- [ ] `aws_route53_zone.main` の**新規作成が出ない**(A-3 の import が効いている)
- [ ] `aws_apprunner_custom_domain_association` が**置き換え**になる(`api.neorie.com` へ)
- [ ] `aws_apprunner_service` が**再作成されない**(`APP_BASE_URL` は in-place 更新のはず)
- [ ] RDS / VPC / NAT / ECR / Secrets に差分が無い

```bash
cd ~/projects/ship-yard/infra/prod && terraform apply
```

> ⚠ **Phase 7 と同じ `for_each` 問題が再発する可能性がある**。証明書の検証レコードは関連付けを作った後でないと値が確定しないため、`Invalid for_each argument` で止まったら 2 段階 apply にする。
>
> ```bash
> terraform apply -target=aws_apprunner_custom_domain_association.api
> terraform apply
> ```

```bash
curl -i https://api.neorie.com/health
```

- [ ] `api.neorie.com` が 200 を返す(証明書の検証に数分〜数十分)

### A-7. Vercel を差し替える

1. Settings → **Domains** → `neorie.com` を追加
2. 提示された A / CNAME を Route53 に登録

```bash
add_record "neorie.com"     A     "<Vercel が表示した IP>"
add_record "www.neorie.com" CNAME "<Vercel が表示した値>"
```

3. **apex を Primary にする**(前回 `www` へのリダイレクトになっていたため要確認)
4. 環境変数(Production)を更新する

| 変数                                | 新しい値                                     |
| ----------------------------------- | -------------------------------------------- |
| `SITE_URL`                          | `https://neorie.com`                         |
| `API_URL`                           | `https://api.neorie.com`                     |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk の新しい `pk_live_...`(変わっていれば) |
| `CLERK_SECRET_KEY`                  | 同上                                         |

5. **再デプロイ**(環境変数はビルド時に取り込まれるため)
6. 旧ドメイン `useshipyard.dev` は**この時点で外す**

- [ ] `https://neorie.com` が 200
- [ ] `/robots.txt` `/sitemap.xml` が 200 で、中身の URL が `neorie.com` になっている

### A-8. Webhook URL を更新する

| サービス   | 新しい URL                               | 備考                                                                              |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| **Stripe** | `https://api.neorie.com/webhooks/stripe` | 既存エンドポイントを編集。**署名シークレットが変わったら Secrets Manager も更新** |
| **Clerk**  | `https://api.neorie.com/webhooks/clerk`  | 同上。**Signing Secret が変わる可能性が高い**                                     |

シークレットが変わった場合は投入し直す。

```bash
ARN=$(aws secretsmanager list-secrets \
  --query "SecretList[?starts_with(Name,'shipyard-prod-app-config')].ARN | [0]" --output text)
CUR=$(aws secretsmanager get-secret-value --secret-id "$ARN" --query SecretString --output text)
NEW=$(printf '%s' "$CUR" | jq --arg v '<新しい whsec_...>' '.CLERK_WEBHOOK_SECRET = $v')
umask 077; TMP=$(mktemp); printf '%s' "$NEW" > "$TMP"
aws secretsmanager put-secret-value --secret-id "$ARN" --secret-string "file://$TMP"; rm -f "$TMP"
```

**投入後は再デプロイが必要**(シークレットは起動時に解決される)。

```bash
aws apprunner start-deployment \
  --service-arn "$(cd ~/projects/ship-yard/infra/prod && terraform output -raw apprunner_service_arn)"
```

- [ ] Clerk の「Send test event」が 2xx
- [ ] Stripe の Webhook ログが 2xx

---

## B. ブランド名の差し替え

**ドメイン移行と独立して進められる。** DNS の待ち時間に実施するとよい。

### B-1. ユーザーに見える箇所(必須)

| ファイル                                                         | 内容                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/web/src/app/layout.tsx`                                    | `title` / OG `title` / `siteName` / Twitter `title`    |
| `apps/web/src/app/opengraph-image.tsx`                           | `alt` とワードマークの描画文字列                       |
| `apps/web/src/app/page.tsx`                                      | JSON-LD の `Organization.name` / `WebSite.name`        |
| `apps/web/src/app/p/[slug]/[projectId]/blog/[postSlug]/page.tsx` | JSON-LD の `publisher.name`                            |
| `apps/web/src/components/shipyard-logo.tsx`                      | **ファイル名 + コンポーネント名 + ワードマーク文字列** |
| `apps/web/src/app/_components/marketing/site-header.tsx`         | ロゴ import / `aria-label`                             |
| `apps/web/src/app/_components/marketing/site-footer.tsx`         | ロゴ import / コピーライト                             |
| `apps/web/src/app/_components/marketing/hero-section.tsx`        | 本文コピー                                             |
| `apps/web/src/app/sign-in/[[...sign-in]]/page.tsx`               | ロゴ import / `aria-label`                             |
| `apps/web/src/app/sign-up/[[...sign-up]]/page.tsx`               | 同上                                                   |
| `apps/web/src/app/onboarding/page.tsx`                           | 見出し「Shipyard へようこそ」                          |
| `apps/web/src/app/invite/[token]/page.tsx`                       | 本文「承諾には Shipyard …」                            |

**ロゴのマーク(帆船の SVG)も要検討。** `Neorie` は造船所由来なので船のモチーフは残せるが、`Shipyard` からの脱却を明確にするなら差し替える。

### B-2. メール送信元

`infra/prod/terraform.tfvars` の `mail_from` を `Neorie <noreply@neorie.com>` にする(A-3 で実施済)。

### B-3. ドキュメント

`docs/` に 289 件、`README.md` に 9 件。**急がない**が、公開前に一括置換しておく。

```bash
grep -rl "Shipyard" docs README.md | xargs sed -i '' 's/Shipyard/Neorie/g'
```

> ⚠ 一括置換は**過去の経緯を記した箇所まで書き換えてしまう**。`PROJECT_STATUS.md` の変更履歴や ADR は「当時 Shipyard という名前だった」という事実の記録なので、**置換対象から外すか、置換後に見直す**。

### B-4. AWS リソース名は変更しない

前述のとおり `shipyard-prod-*` / DB 名 / ECR は据え置く。**`infra/` の 13 件は触らない。**

---

## 完了条件

- [ ] `https://neorie.com` が 200、`https://api.neorie.com/health` が 200
- [ ] サインアップ → `User` 作成 → オンボーディングが通る(Clerk webhook)
- [ ] Google / GitHub の OAuth でサインインできる
- [ ] 招待メールが `noreply@neorie.com` から届く
- [ ] Stripe の Checkout / Portal が動く
- [ ] `robots.txt` / `sitemap.xml` の URL が `neorie.com`
- [ ] UI に `Shipyard` の文字列が残っていない
- [ ] 旧ドメインを Vercel から外した

---

## ロールバック

移行中に問題が出たら、**`useshipyard.dev` はまだ生きている**(2027-07-25 まで)。

- Vercel に旧ドメインを戻す
- `terraform.tfvars` の `domain_name` を戻して apply
- Clerk のドメインを戻す(ただし OAuth の再設定が再度必要)

ただし **Clerk のドメイン変更は往復のコストが高い**ため、A-4 に着手する前に他の準備をすべて終えておくこと。

---

## 関連ドキュメント

- [`production-cutover.md`](./production-cutover.md) — 各サービスの設定手順の詳細(DNS ヘルパー、Secrets 投入等)
- [`../infrastructure-cost.md`](../infrastructure-cost.md) — ドメイン費用の扱い
