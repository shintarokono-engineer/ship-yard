---
name: run-e2e
description: 実装した API を実際に叩いて動作確認する。dev server 起動 → JWT 受領 → curl 連発 → DB で副作用確認 → 結果サマリ Markdown 出力。`/test-design` の出力ファイルを観点として渡すと安定する。Windows + bash の日本語文字化け対策(UTF-8 ファイル経由 payload)を含む。
allowed-tools: Read Write Edit Bash AskUserQuestion Glob Grep PushNotification
---

shipyard の API を実 OpenAI / Anthropic / DB を相手に E2E 実行します。シナリオは `/test-design` の出力 or 直接指定。結果は Markdown サマリとして保存。

## いつ使うか

- 新しい API エンドポイントを実装した直後
- セルフレビュー後、コミット前の最終確認
- 既存機能のリグレッション確認(過去 test-design 出力を再実行)
- **使わない**:
  - 実装が未完成(まず typecheck / lint を通す)
  - UI のみの変更(`webapp-testing` skill を使う)
  - 副作用のない pure 関数(unit test のスコープ)

## 前提と環境

- API URL: `http://localhost:4000`(`PORT` 環境変数で変わる場合は dev server の log から確認)
- 認証: Clerk JWT(Bearer)、ユーザーから貼り付けてもらう。有効期限 1h
- DB: `docker exec shipyard-postgres psql -U shipyard -d shipyard -c "..."` で SELECT 確認
- テナントヘッダ: ALS 経由のルートでは `X-Tenant-Slug: <slug>`、path slug ルート(`/workspaces/:slug/...`)では不要
- 共通テストテナント: `my-workspace`(変わったらユーザーに確認)

## 進め方

1. **dev server 起動確認**:
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000` で疎通(0/200/404 のいずれか)
   - 落ちていれば `pnpm dev:api` を background で起動 → `until grep -q "Nest application successfully started"` で待機
   - 起動の経緯はユーザーに 1 行で報告(「dev server を起動しました」)

2. **テスト観点の取得**(`AskUserQuestion`):
   - `/test-design` 出力ファイルがあるか?(`.claude/output/test-design/` を `Glob`)
   - あれば最新ファイルを `Read` してシナリオを取り出す
   - なければ「対象 URL / メソッド / シナリオ概要」を直接ヒアリング

3. **JWT 受領**:
   - `PushNotification` で「JWT を貼り付けてください」と通知
   - `AskUserQuestion` で `eyJ...` の本体を受け取る(Bearer プレフィックスは不要、本体のみ)
   - 取得方法を案内する場合: Web フロントを別ターミナルで起動 → サインイン → DevTools Console で `await window.Clerk.session.getToken()`

4. **シナリオを順次実行**:
   - 各シナリオを 1 リクエストずつ:
     ```bash
     JWT='eyJ...'
     curl -s -X <METHOD> "http://localhost:4000<PATH>" \
       -H "Authorization: Bearer $JWT" \
       -H "Content-Type: application/json; charset=utf-8" \
       -d '<payload>'
     ```
   - **日本語を含む payload は必ず UTF-8 ファイル経由**(Windows PowerShell + bash で文字化けするため):
     ```bash
     # Write tool で .claude/output/run-e2e/payload-N.json に書く
     curl ... --data-binary @.claude/output/run-e2e/payload-N.json
     ```
   - レスポンスから主要フィールドを抽出(`id` / `version` / `costJpy` / 等)

5. **DB で副作用を確認**(必要に応じて):
   - 想定 INSERT / UPDATE / soft delete を SELECT で観察
     ```bash
     docker exec shipyard-postgres psql -U shipyard -d shipyard -c \
       "SELECT id, version, embedding IS NOT NULL FROM \"ProjectDocument\" WHERE \"projectId\" = '...';"
     ```
   - AIUsage 記録の確認:
     ```bash
     docker exec shipyard-postgres psql -U shipyard -d shipyard -c \
       "SELECT model, feature, \"tokensIn\", \"tokensOut\", \"costJpy\" FROM \"AIUsage\" WHERE \"createdAt\" > NOW() - INTERVAL '5 minutes' ORDER BY \"createdAt\" DESC;"
     ```

6. **結果サマリを書き出し**:
   - `.claude/output/run-e2e/<yyyymmdd-hhmm>-<topic>.md` に Markdown で保存
   - 各シナリオに ✅ / ❌ / ⚠️ を付け、観察と期待差分を記録
   - 標準出力にも完成版を提示

7. **後始末**:
   - 一時 payload ファイル(`.claude/output/run-e2e/payload-*.json`)を削除
   - dev server を停止するかユーザーに確認(`AskUserQuestion`)

## 結果サマリのフォーマット

```markdown
# E2E 実行結果: <対象>

> 実行日時: <yyyymmdd-hhmm>
> 観点ファイル: `.claude/output/test-design/<...>.md`(あれば)

## 環境

- API: http://localhost:4000(dev server: 起動中 / 起動した)
- DB: shipyard-postgres(docker)
- テナント: my-workspace

## シナリオ別結果

### ✅ シナリオ 1: <名称>

リクエスト:
\`\`\`http
POST /workspaces/my-workspace/projects/.../documents/.../refine
Authorization: Bearer <JWT>
Content-Type: application/json

{ "goal": "..." }
\`\`\`

期待: <期待結果>
実測: <実際のレスポンス / DB 状態>
判定: ✅ 期待通り

### ❌ シナリオ 2: ...

期待: 400 バリデーションエラー
実測: 200 OK(バリデーション漏れ)
判定: ❌ 修正必要

## DB 確認

- ProjectDocument: <件数 / 状態>
- AIUsage: <model / feature / tokens / 円コスト>

## 総評

- 成功: <数> / 失敗: <数> / 警告: <数>
- 総 AI コスト: <円>
- 修正候補: <あれば>
```

## ルール

- **JWT は出力ファイルに含めない**(セッションログにも貼り直さない、環境変数 `$JWT` 経由で扱う)
- **日本語 payload は必ず UTF-8 ファイル経由**(`--data-binary @file.json`)
- **DB 直接変更はしない**(SELECT のみ、INSERT / UPDATE / DELETE は API 経由で観察する)
- **Free 上限テストは慎重に**(20 record 積むと FREE プランの動作確認が以後できなくなる)
- **失敗時に勝手にリトライしない**(エラー内容を提示してユーザー判断を仰ぐ)
- **結果は `.claude/output/run-e2e/` に保存**(git 管轄外)
- **dev server を勝手に止めない**(後始末で必ず確認)
- **本番 / staging には絶対に向けない**(localhost 固定、URL を変える時は明示確認)
