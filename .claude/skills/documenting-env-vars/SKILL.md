---
name: documenting-env-vars
description: .env.example / .env.sample / 設定ファイルから環境変数を抽出し、用途・必須性・デフォルト値・取得方法を表形式でドキュメント化する。プロジェクト参画直後、新メンバーオンボーディング、env が増えた時に使う。
allowed-tools: Read Write Edit Bash Glob Grep
disable-model-invocation: true
---

「この変数は何で、どこから取るのか」を一目で分かる表に整理します。

## いつ使うか

- プロジェクト参画直後、`.env.example` を見て「これ何?」となった時。
- 新メンバーのオンボーディング資料を作る時。
- env が増えた／変わった時のドキュメント更新。
- **使わない**: シークレットそのものを記載（絶対に書かない）。

## 進め方

1. **必要情報をヒアリング** — `AskUserQuestion` で順次。最初の指示に含まれている項目はスキップ。納得まで掘り下げ可。1 ラウンドあたり最大 4 質問のため、項目が多い場合は複数ラウンドに分ける:
   - **対象ファイル**: `.env.example` / `.env.sample` / `config/*.example` / 自由パス指定
   - **不明変数の扱い**: ユーザーに 1 つずつ聞く / コメントから推測 / 「不明」と記載
   - **出力先**: `docs/env.md` / `README.md` の追記 / `.claude/output/...` のみ
   - **対象環境**: 開発のみ / staging も / production も
   - **取得方法の記載**: 必要 / 不要（インフラ管轄なので別ドキュメント）

2. **対象ファイルを読み込み**:
   ```
   .env.example
   .env.sample
   .env.local.example
   apps/*/.env.example       # モノレポの場合
   ```

3. **各変数を抽出**:
   - 変数名
   - デフォルト値（あれば）
   - 周辺コメント（変数の用途ヒント）
   - コードベースを `Grep` して実際の利用箇所を確認（`process.env.X` / `os.environ['X']` / `import.meta.env.X` など）

4. **不明な変数があればヒアリング**:
   - 用途
   - 必須/任意
   - 取得方法（社内 vault / 個人で生成 / 公開 API キー）
   - 値の例（シークレットは伏せる）

5. **成果物を `.claude/output/documenting-env-vars/env-<YYYY-MM-DD>.md` に書き出し** — 指定があれば `docs/env.md` にも反映。

## 出力フォーマット

```markdown
# 環境変数

## 必須

| 変数名 | 用途 | 取得方法 | 例 |
|---|---|---|---|
| `DATABASE_URL` | DB 接続文字列 | 社内 vault: `<path>` | `postgres://localhost:5432/dev` |
| `API_KEY_X` | 外部 API X の認証 | 個人で <URL> から生成 | `xxx****` |

## 任意

| 変数名 | 用途 | デフォルト | 例 |
|---|---|---|---|
| `LOG_LEVEL` | ログレベル | `info` | `debug` |
| `PORT` | サーバーポート | `3000` | `8080` |

## 環境別の差分

| 変数名 | dev | staging | production |
|---|---|---|---|
| `API_BASE_URL` | `localhost:3001` | `staging.api.example.com` | `api.example.com` |

## セットアップ手順

1. `cp .env.example .env`
2. 上記表の必須変数を埋める
3. シークレットは <vault/1Password/etc.> から取得
4. `npm run dev` で起動
```

## ルール

- **シークレット値そのものを書かない**。例示は伏せ字（`xxx****`）。
- **取得方法を必ず書く**（社内 vault パス、個人発行 URL、無料 API なら登録 URL）。
- **コードでの利用箇所を確認**してから記載（`Grep` で `process.env.X` を確認）。
- **不明変数は「不明」と書いて完了**しない。最低 1 ラウンドはヒアリングする。
- 既存の `docs/env.md` がある場合は上書きせず、差分を提示してユーザー判断を仰ぐ。
- production 値の取り扱いはチームの方針に従う（普通はインフラ/Ops 管轄）。
