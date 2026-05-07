---
name: writing-release-notes
description: バージョン範囲の git 履歴・PR・タグを読み込み、ユーザー/開発者向けのリリースノートを生成する。新機能・修正・破壊的変更・既知の問題を分類し、対象読者に合わせたトーンで出力する。リリース時に使う。
allowed-tools: Read Write Edit Bash Glob Grep
disable-model-invocation: true
---

「直前のタグから今までの変更」を、読者が 30 秒で要点を掴める粒度に整理します。

## いつ使うか

- バージョンタグを切る前後。
- 内部リリース連絡を書く時。
- CHANGELOG.md を更新する時。
- **使わない**: PR の説明書き（→ `writing-pr-description`）。

## 進め方

1. **必要情報をヒアリング** — `AskUserQuestion` で順次。最初の指示に含まれている項目はスキップ。納得まで掘り下げ可。1 ラウンドあたり最大 4 質問のため、項目が多い場合は複数ラウンドに分ける:
   - **バージョン範囲**: 直前タグ → HEAD / 指定タグ間 / 指定コミット間
   - **対象読者**: エンドユーザー（製品向け）/ API 利用者（開発者向け）/ 社内（エンジニア向け）
   - **トーン**: 簡潔（箇条書きのみ） / 詳細（背景含む） / マーケ寄せ（ベネフィット中心）
   - **含めない変更**: 内部リファクタ / dependency bump / CI/CD 設定 / typo 修正
   - **強調したい変更**: あれば指定（目玉機能、互換性破壊）
   - **出力形式**: Markdown（CHANGELOG.md 用） / プレーンテキスト（Slack/メール） / 両方

2. **履歴取得**:

   ```bash
   git log <prev-tag>..HEAD --oneline
   git log <prev-tag>..HEAD --format="%H %s%n%b"
   gh pr list --state merged --base main --search "merged:>=<date>"
   ```

3. **変更を分類**:
   - **新機能** (Features)
   - **改善** (Improvements)
   - **修正** (Bug fixes)
   - **破壊的変更** (Breaking changes) — 最上位に出す
   - **非推奨化** (Deprecations)
   - **セキュリティ** (Security) — 該当時は最上位
   - **内部** (Internal) — 含めるなら別カテゴリ

4. **読者に合わせて翻訳**:
   - エンドユーザー向け: 「何ができるようになったか」中心、技術用語を抑える
   - 開発者向け: API 変更、シグネチャ、移行手順を含める
   - 社内向け: 影響範囲、運用注意、ロールバック手順

5. **既知の問題セクション** — 残ってる issue で利用者が引っかかる可能性あるものを列挙。

6. **成果物を `.claude/output/writing-release-notes/<version>.md` に書き出し** — 標準出力にも完成版を提示。

## 出力フォーマット

### Markdown（CHANGELOG.md 用）

```markdown
## <version> — <YYYY-MM-DD>

### Breaking changes

- <変更>: <影響>。<移行手順>

### Features

- <機能>: <ユーザー視点の説明>

### Improvements

- <改善>

### Bug fixes

- <修正>

### Deprecations

- <非推奨化>: <代替> に置き換え予定（<削除予定バージョン>）

### Security

- <修正内容>（CVE があれば併記）

### Known issues

- <既知の問題>: <ワークアラウンド>
```

### プレーンテキスト（Slack/メール）

```
[<version> リリース]

主な変更:
• <目玉機能/破壊的変更>
• ...

修正:
• ...

破壊的変更がある場合の移行:
1. ...

詳細: <CHANGELOG.md URL>
```

## ルール

- **破壊的変更は最上位に**。見落とすと事故る。
- **PR タイトルをそのまま貼らない**。読者向けに翻訳する。
- **内部変更を混ぜない**（含めると指定された場合を除く）。
- **マーケ言葉を避ける**（"blazing-fast", "robust"）。事実を述べる。
- バージョン番号と日付は確認した値を使う。捏造禁止。
- セキュリティ修正は CVE / 影響範囲 / 推奨アクションを明記。
