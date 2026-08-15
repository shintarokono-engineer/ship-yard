# Zenn 記事(正本は `articles/` にあります)

Day 52-53 で書いた技術記事は、Zenn CLI の規約に合わせて移動しました。**編集はこちらではなく下記の正本を直してください。**

| 対象     | パス                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------ |
| 記事本文 | [`articles/neorie-multitenant-rag-ai-billing.md`](../../articles/neorie-multitenant-rag-ai-billing.md) |
| 画像     | `images/neorie/`(`landing.jpg` / `idea-validation.jpg` / `neorie-demo.gif`)                            |

同じ本文を 2 か所に置くとどちらが最新か分からなくなるため、内容は移設済みです(旧本文は git の履歴に残っています)。

## 記事の概要

- **タイトル**: 個人開発で B2B SaaS を作るなら先に知りたかった、マルチテナント・RAG・AI 課金の設計判断 6 つ
- **構成**: ① テナント分離を構造で守る ② RAG が構造的に成立しなかった話 ③ AI クレジット制と予約(TOCTOU)④ `tool_choice` で Web Search が呼ばれなかったバグ ⑤ Subscription Quantity の 3 層同期 ⑥ 環境変数の 3 経路
- **公開状態**: frontmatter の `published` で管理。`true` にして push すると公開されます

## 公開の手順

1. Zenn のダッシュボードで GitHub 連携(初回のみ。リポジトリ直下の `articles/` と `images/` を参照します)
2. `npx zenn-cli@latest preview` で表示確認(任意)
3. `published: true` に変更して push

## 公開後にやること

1. 記事 URL を取得する
2. [`x-launch-threads.md`](./x-launch-threads.md) の `{{ARTICLE_URL}}`(4 か所)を差し替える
3. 必要なら README に記事リンクを追加する

## 書くときの前提(記事・告知文で共通)

- **実績・利用者数・導入事例は書かない。** 実ユーザーがいない段階で数字や証言を出すと優良誤認になります
- **未実装の機能を提供済みとして書かない。** 共同編集・レビュー・監査ログは `AuditLog` / `Comment` が未実装のため「近日提供」扱いです(LP・README と表記を揃えること)
- 第三者プロダクトの挙動は断定せず、「公開情報を見る限り」等を挟む
