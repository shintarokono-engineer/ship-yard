---
name: checking-commit
description: コミット前の品質ゲート。プロジェクトの lint、型チェック、関連テストをステージ済み/直近変更ファイルに対して実行し、誤って混入したシークレットや巨大バイナリをスキャンする。`git commit` の直前、または編集後に緑判定を取りたいときに使う。コミットも push もしない。報告のみ。
allowed-tools: Read Write Edit Bash Glob Grep
disable-model-invocation: true
---

コミットされる前に、プロジェクトを意識した高速な正気度チェックを実行します。

## いつ使うか

- `git commit` 直前。
- 一連の編集後に「いまの変更が壊していないか」を素早く確認したいとき。
- **使わない**: コミット済み履歴の検証（CI に任せる）。

## 進め方

1. **必要情報をヒアリング** — `AskUserQuestion` で順次。最初の指示に含まれている項目はスキップ。納得まで掘り下げ可。1 ラウンドあたり最大 4 質問のため、項目が多い場合は複数ラウンドに分ける:
   - **対象**: ステージ済みのみ / ワークツリー差分も含む / 特定パス
   - **スキップしたい項目**: なし / フォーマット / テスト / 型チェック / 大きいテストスイート全実行
   - **厳しさ**: 警告も止める（厳格） / エラーのみブロック（標準） / 報告のみ（緩）

2. **プロジェクト形を検出**:
   - `package.json`（ルート + workspace 各パッケージ）から `scripts.lint`, `scripts.typecheck` / `tsc`, `scripts.test` を抽出
   - 通例フォールバック: `npm run lint`, `npx tsc --noEmit`, `npm test`
   - 非 JS: `pyproject.toml`（ruff/mypy/pytest）, `Cargo.toml`（clippy/cargo test）, `go.mod`（go vet/go test）

3. **何が変わったかを特定**:

   ```bash
   git diff --name-only --staged       # ステージあり
   git diff --name-only                  # なければ作業ツリー差分
   ```

   どちらも空なら「チェック対象なし」と報告して終わる。

4. **チェックを実行**（変更ファイルにスコープを絞る）:
   - **Lint** — `npx eslint <files>`（または `ruff check <files>`）
   - **型チェック** — 通常はプロジェクト全体（`npx tsc --noEmit`）。スコープ絞りは難しい
   - **フォーマット** — `npx prettier --check <files>`
   - **テスト** — `npm test -- --findRelatedTests <files>`（Jest）/ `npx vitest run --related <files>`。関連検出ツールがなければ変更パッケージの全テストにフォールバック

5. **シークレットスキャン** — 高リスクパターンを grep:

   ```
   AKIA[0-9A-Z]{16}             # AWS access key
   sk_live_[0-9a-zA-Z]{24,}     # Stripe live key
   ghp_[0-9a-zA-Z]{36}          # GitHub PAT
   -----BEGIN.*PRIVATE KEY-----
   ```

   加えて `.env*`, `*.pem`, `*.key` がステージされていないかをヒューリスティック確認。

6. **巨大ファイルチェック** — 1 MB 超のステージ済みファイルを警告。

7. **成果物を `.claude/output/checking-commit/<YYYY-MM-DD-HHmm>.md` に書き出し** — 標準出力には判定サマリのみ。

## 出力フォーマット

```
## checking-commit

### スコープ
<N ファイルステージ済み | 作業ツリー変更>: file1, file2, ...

### 結果
- Lint:        PASS / FAIL (<件数>)
- 型チェック:   PASS / FAIL (<最初のエラー>)
- フォーマット: PASS / FAIL
- テスト:      PASS / FAIL (<失敗テスト名>)
- シークレット: CLEAN / FOUND (<file>:<line> <種別>)
- 巨大ファイル: NONE / <file> (<size>)

### 判定
<緑: コミット OK | 赤: 上記を直してから>

### 修正候補
- <失敗があるときのみ>
```

## ルール

- **プロジェクトが対応していないコマンドは実行しない**。`package.json` に `lint` script も eslint 設定もないなら、lint をスキップして「lint 設定なし」と述べる。
- **自動修正しない**。`npx eslint --fix` 等を案内するが、実行はユーザーが行う。
- **コミットしない**。これはチェックスキルでありアクションではない。
- **高速にする**。全リポジトリ実行よりスコープ実行を優先。例外的に全リポジトリ `tsc` は TS の制約上仕方ない。
- チェックが遅い（>30 秒）場合は警告し、フラグでスキップ可能にする。
- 赤判定はブロッカーではなく情報。コミット強行するかはユーザー判断。
