# エラー UI 表示形式ガイド

最終更新: 2026-05-29(F6 / §9.12.2 観点 6 起票時に作成)

Shipyard のフロントエンド(`apps/web`)で、エラー / 警告 / 情報を画面に表示するときの**表示形式の使い分け基準**を定義する。逸脱は §9.12.2 観点 6 のセルフ評価で監査する。

---

## 1. 4 つの表示形式

| 形式            | 使う状況                                       | 配置            | 永続性          |
| --------------- | ---------------------------------------------- | --------------- | --------------- |
| **Alert**(永続) | ページ内の重要なお知らせ・常時表示の警告       | 該当セクション内 | ページ離脱まで   |
| **Toast**(瞬時) | 直前の操作の結果フィードバック                  | 画面右下(固定) | 数秒で自動消失   |
| **Inline**(項目隣接) | フォーム / 行アクションの直接的なエラー           | 該当フィールド・行の隣 | 状態解消まで     |
| **Dialog**(モーダル内) | モーダル内のアクション失敗 / 入力検証エラー | モーダル内ボタン上 | モーダル閉じるまで |

---

## 2. 使い分けの基準

### Alert(永続)を使う場面

- **AI 機能のクォータ超過**:プランの月次クレジット上限に達した告知(該当 Dialog 内 + 設定タブの両方)
- **権限不足**:閲覧専用ロールが書き込み操作を試みた場合の告知
- **データの不整合・サービス障害**:画面全体が部分的に動かないことを継続的に伝える必要があるとき

実装:`role="alert"` + 既存のトーン別色(destructive / amber / emerald)。

```tsx
<div
  role="alert"
  className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
>
  {message}
</div>
```

| トーン     | 用途                          | クラス                                                                          |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------- |
| destructive | 失敗・拒否(赤系)              | `border-destructive/40 bg-destructive/10 text-destructive`                       |
| amber      | クォータ・期限切れ警告(黄系) | `border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100`         |
| emerald    | 公開状態の肯定的告知(緑系)   | `border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300` |

### Toast(瞬時)を使う場面

- **行アクションの結果**:メンバーロール変更・招待取り消し・招待再送など、画面遷移を伴わない操作の成功/失敗
- **AI 一括生成の完了通知**:CHECKLIST_GEN / TASK_SPLIT などの完了で「N 件生成しました」
- **コピーボタンなどの軽い操作の確認**

実装:`sonner` の `toast.success` / `toast.error` / `toast.warning`。

```tsx
import { toast } from 'sonner';

toast.success('ロールを変更しました。');
toast.error(result.formError ?? '操作に失敗しました。');
toast.warning('一部のメンバーへの送信に失敗しました。');
```

**使う条件**:
- 操作の起点(クリックボタン)が画面上に残っている(= 同じ画面に留まる)
- ユーザーが結果を確認した後、何もしなくて良い(自動消失でよい)
- フォーム入力の検証エラーではない(それは Inline)

### Inline(項目隣接)を使う場面

- **フォームフィールド単位の検証エラー**:`<FormField errors={...}>` の `errors` 配列で表示
- **行アクションのエラーが行内に閉じている場合**:インラインフォーム送信で、トースト化するほどではない軽い検証エラー

実装:`<FormField>` の `errors` props で渡す(該当フィールド直下に出る)。

```tsx
<FormField id="title" label="タイトル" errors={state.fieldErrors?.title}>
  <Input id="title" name="title" />
</FormField>
```

### Dialog(モーダル内)を使う場面

- **モーダル内の Server Action 失敗**:検証エラー・クォータ超過・BE エラー
- **モーダルを閉じてしまうと操作を再試行しづらい場合**

実装:Dialog 内の `<DialogFooter>` の上に Alert を配置(`role="alert"`)。クォータ超過時は `quotaExceeded` 状態を別途扱い、アップグレード導線を併設する。

```tsx
{state.formError && !state.quotaExceeded && (
  <p
    role="alert"
    className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
  >
    {state.formError}
  </p>
)}

{state.quotaExceeded && (
  <div
    role="alert"
    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
  >
    <p>{state.formError}</p>
    <Link href={`/w/${slug}/settings/billing`} className="...">プランをアップグレード</Link>
  </div>
)}
```

---

## 3. 4 形式の選び方フローチャート

```
質問 1:操作の結果は数秒経てば消えてよいか?
  はい → Toast
  いいえ ↓

質問 2:エラーは特定のフォームフィールドに紐づくか?
  はい → Inline(<FormField errors>)
  いいえ ↓

質問 3:エラー発生場所はモーダル内か?
  はい → Dialog 内 Alert
  いいえ → ページ内 Alert
```

---

## 4. アンチパターン

| やってはいけないこと                                       | 理由                                                                   | 正しい対応                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| クォータ超過を Toast で表示                                | 自動消失するとアップグレード導線を見落とす                              | Dialog 内 Alert(amber)で永続表示    |
| 検証エラーをページ上部に Alert で集約                      | 該当フィールドが分からず修正に手間取る                                  | Inline(`<FormField errors>`)        |
| 成功 Toast を出した後、画面状態を更新しない                | ユーザーが「本当に成功した?」と不安になる                              | `revalidatePath` or 楽観的 UI 更新を必ず併用 |
| destructive 色を「警告」に使う(例:期限切れ間近)        | 赤系は「不可逆な失敗」と認識される                                      | amber 系を使う                      |
| Dialog 内エラーで `toast.error` も同時に出す               | 二重表示で UX が散らかる                                                | どちらか一方(Dialog 内 Alert 推奨) |
| `console.error` だけで UI に何も出さない                   | ユーザーは何が起きたか分からない                                        | いずれかの形式で必ず UI 通知         |

---

## 5. 既知の例外

- **`apps/web/src/app/p/[slug]/[projectId]/error.tsx`**: Next.js の Error Boundary を使った例外。公開 LP の SSR エラー時のフォールバック。本ガイドの 4 形式とは別レイヤー(フレームワーク機構)。
- **`signed-in-redirect-button.tsx`** などの Server Component 内の `redirect()`:エラーではなく成功時のリダイレクトのため対象外。

---

## 6. 監査方法

1. `grep -rn 'role="alert"\\|toast\\.\\|<Alert' apps/web/src` で全 4 形式の出現箇所を列挙
2. 各箇所について本ガイドの「使い分けの基準」と照合
3. 逸脱があれば本ガイドに沿わせる
4. **新規実装時は本ガイドを参照することを `apps/web/CLAUDE.md`(将来作成)or PR テンプレに明記**

---

## 7. 関連ドキュメント

- `docs/implementation-rules.md` — 横断的な実装制約(ガイド全体の親)
- `apps/web/src/app/w/[slug]/_shared/form-field.tsx` — Inline errors の実装
- `apps/web/src/components/ui/sonner.tsx` — Toast 基盤
- `apps/web/src/lib/api/errors.ts` — `classifyAiApiError` などのエラー分類ヘルパー
