# Vercel セットアップ手順

`apps/web`(Next.js)の自動デプロイを Vercel で構築する手順をまとめます。

> **重要**: 本手順は **Day 4 で `apps/web` に Next.js 雛形を導入した後** に実行します。Day 3 時点では `apps/web` に実コードがないため、Vercel ビルドが失敗します。

---

## 前提条件

- [ ] GitHub リポジトリが存在する(`shintarokono-engineer/ship-yard`)
- [ ] `apps/web/` に Next.js 雛形が存在する(Day 4 で導入)
- [ ] `apps/web/package.json` に `dev` / `build` / `start` スクリプトが定義されている

## 手順

### 1. Vercel アカウント作成・ログイン

1. https://vercel.com にアクセス
2. **GitHub アカウントでサインイン**(Vercel が GitHub OAuth で連携)
3. プラン選択: 開発期間中は **Hobby**(無料)、**MVP リリース時に Pro($20/月)へ移行**(商用利用は Pro 必須)

### 2. プロジェクトの作成

1. ダッシュボードで「Add New」→「Project」をクリック
2. **「Import Git Repository」** で `ship-yard` を選択
3. 「Configure Project」画面に遷移する

### 3. プロジェクト設定

#### Framework Preset

- 自動検出: **Next.js**(`apps/web` に Next.js コードがあれば自動)

#### Root Directory

- **`apps/web`** を指定(モノレポ対応の必須設定)
- 「Edit」ボタンを押して入力

#### Build & Development Settings

| 項目                | 値                                                        | 備考                               |
| ------------------- | --------------------------------------------------------- | ---------------------------------- |
| Build Command       | `cd ../.. && pnpm turbo run build --filter=@shipyard/web` | Turborepo ルートからフィルタビルド |
| Output Directory    | `.next`(デフォルト)                                       | Next.js 標準                       |
| Install Command     | `cd ../.. && pnpm install --frozen-lockfile`              | モノレポルートで pnpm install      |
| Development Command | `pnpm dev`                                                | `vercel dev` 用(任意)              |

> 上記 Build Command / Install Command は明示的に書く形で記載しています。Vercel のモノレポ自動検出に任せても動く可能性がありますが、**明示する方が事故が少ない** ため推奨します。

### 4. 環境変数(Day 4 以降に追加)

Day 4 で Clerk 統合する際に以下を Vercel ダッシュボードに登録:

| 変数名                              | スコープ             | 用途                               |
| ----------------------------------- | -------------------- | ---------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production / Preview | Clerk のクライアント側キー         |
| `CLERK_SECRET_KEY`                  | Production / Preview | Clerk のサーバー側シークレットキー |
| `CLERK_WEBHOOK_SECRET`              | Production           | Clerk Webhook 検証用               |

> `NEXT_PUBLIC_` プレフィックス付きのみブラウザに公開される。シークレット系には絶対に付けないこと。

その他、Day 6 以降で追加される予定:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`(クライアント)
- `STRIPE_SECRET_KEY`(サーバー)
- `STRIPE_WEBHOOK_SECRET`(Webhook 検証)
- `ANTHROPIC_API_KEY`(AI)
- `DATABASE_URL`(本番 RDS、AWS Secrets Manager 経由)
- `REDIS_URL`(本番 ElastiCache、Secrets Manager 経由)

### 5. デプロイトリガー設定

デフォルト動作:

- `main` への push → **Production デプロイ**
- 他ブランチへの push → **Preview デプロイ**(固有 URL 払い出し)
- PR への push → Preview デプロイ + PR コメントに URL 自動投稿

特に変更不要(Vercel デフォルトのまま)。

### 6. カスタムドメイン設定(リリース直前、Week 3 想定)

1. ダッシュボード → Project → Settings → Domains
2. ドメイン追加(例: `shipyard.app`)
3. 表示される DNS レコードをドメイン管理側(お名前.com、Cloudflare 等)に設定
4. 数分〜数時間で SSL 証明書(Let's Encrypt)が自動発行

### 7. Turborepo リモートキャッシュ統合(任意、推奨)

ビルド時間短縮のため:

1. ダッシュボード → Project → Settings → General
2. **「Turborepo Remote Caching」を Enable**
3. Vercel が自動で `TURBO_TOKEN` と `TURBO_TEAM` を環境変数に設定

これでローカル / CI / Vercel 全てでキャッシュ共有可能(無料)。

### 8. 動作確認チェックリスト

Day 4 で Next.js 導入後、以下を確認:

- [ ] `main` への push で Production が更新される
- [ ] 適当なブランチを push して Preview URL が払い出される
- [ ] PR を作って自動コメントに Preview URL が貼られる
- [ ] Production URL でトップページが表示される
- [ ] ビルドログに「Turborepo Remote Cache: HIT」が出る(2 回目以降)

---

## トラブルシューティング

### ビルドが「Cannot find module 'xxx'」で失敗する

- Install Command が正しいか確認(`cd ../..` してから `pnpm install` する形)
- `pnpm-workspace.yaml` がコミットされているか確認

### `apps/web` の依存パッケージが解決されない

- `apps/web/package.json` の依存に `@shipyard/ui` 等を `"workspace:*"` で記載しているか確認

### Preview URL に古いビルド結果が表示される

- Vercel ダッシュボード → Deployments → 該当 Preview → 「Redeploy」をクリック

---

## 関連ドキュメント

- [Vercel と自動デプロイの解説](../../学習ノート/開発環境/デプロイ.md)(個人学習ノート)
- [`docs/architecture.md`](./architecture.md):Shipyard 全体のデプロイ構成
- [ADR-001: 技術スタック](./adr/001-tech-stack.md):Vercel 採用の根拠
