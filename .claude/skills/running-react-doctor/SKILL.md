---
name: running-react-doctor
description: react-doctor CLI で React/Next.js コードベースの自動健全性監査を実行する。0〜100 のヘルススコアと、性能・セキュリティ・アーキテクチャ・バンドルサイズ・アクセシビリティ・デッドコードに関するファイル単位の診断を返す。複数ファイル横断・新機能・hooks 改修などの React/TS 変更後、PR 前、コードベースが「遅い/散らかっている」と感じたとき、定期健診として使う。
allowed-tools: Read Write Edit Bash Glob Grep
disable-model-invocation: true
---

[react-doctor](https://github.com/millionco/react-doctor) CLI をラップし、その出力を実行可能な次のアクションに変換します。

## いつ使うか

- 複数ファイル横断・新機能・hooks 改修などの React/TS 変更後の PR 前サニティチェック。
- ユーザーが React 側の「コードヘルス」「アンチパターン」レビューを求めているとき。
- 定期健診として（週次など）。
- **使わない**: 些細な変更（typo、1 行修正、React 以外）。

## 進め方

1. **必要情報をヒアリング** — `AskUserQuestion` で順次。最初の指示に含まれている項目はスキップ。納得まで掘り下げ可。1 ラウンドあたり最大 4 質問のため、項目が多い場合は複数ラウンドに分ける:
   - **スコープ**: リポジトリ全体 / `--changed`（main 比較で変更ファイルのみ） / 特定パス
   - **出力詳細度**: 高優先度のみ / 全カテゴリ / `--json` 含むフルレポート
   - **対象環境**: ローカル実行 / プロジェクトが React でない可能性を先に確認

2. **react-doctor を実行** — プロジェクトルートから:
   ```bash
   npx -y react-doctor@latest .
   ```
   - スコープ絞り: `--changed`
   - 機械可読: `--json`
   - 最新フラグは `npx -y react-doctor@latest --help` で確認

3. **結果を要約**:
   - スコアを最初に提示（「Health: 78/100」）
   - 重大度別にグルーピング（ルール別ではない）
   - 高優先度は `file:line` で引用 + 具体修正案
   - 生出力は貼らず、要約のみ

4. **成果物を `.claude/output/running-react-doctor/<YYYY-MM-DD-HHmm>.md` に書き出し** — 標準出力には簡略版を表示。

## 出力フォーマット

```markdown
# react-doctor: <スコア>/100

## 最優先で直したい指摘
1. **<file.tsx:line>** — <問題サマリ>
   <1 行修正案>
2. ...

## 優先度低
- <file:line> — <問題>（修正は任意）

## 健全な点
<監査が良好と判定したもの — 水増しせず簡潔に>

## 詳細を再取得するなら
`npx -y react-doctor@latest --json .` で機械可読フルレポート。
```

## ルール

- ツール実行が失敗（React プロジェクトでない、ネット未接続など）したらそれを報告して止まる。指摘を捏造しない。
- 修正は自動適用しない。提案にとどめてユーザー判断を仰ぐ。
- スコアが高く（>90）かつユーザーが日常レビューを求めているなら「健全」と返して終わる。懸念を捏造しない。
- 指摘はルール ID 単独ではなく `file:line` で引用する。
