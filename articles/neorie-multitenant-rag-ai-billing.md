---
title: '個人開発で B2B SaaS を作るなら先に知りたかった、マルチテナント・RAG・AI 課金の設計判断 6 つ'
emoji: '⚓'
type: 'tech'
topics: ['nestjs', 'prisma', 'postgresql', '個人開発', 'claude']
published: true
---

個人開発で B2B SaaS を作りました。マルチテナント、Stripe のシート課金、RAG、AI 機能一式が入っています。先日公開したので、作る過程で悩んだ設計判断を 6 つ書き出します。

「作ってみた」ではなく、**判断の理由と、判断を間違えて実際に壊れた話**を中心にします。

## 何を作ったか

**Neorie**(ネオリー)という SaaS です。個人開発者と 2〜10 人の小規模チームが、「アイデア → 設計 → 開発 → リリース → 初期ユーザー獲得」までを 1 か所で回すためのツールです。

- アイデア段階の検証(類似プロダクトを Web 検索して Problem-Solution Fit を採点)
- 開発中のプロダクト診断(競合と比べてサービスレベルをスコア化)
- README / LP / リリース告知文の AI ドラフト
- 過去プロジェクトのドキュメントをベクトル検索して生成に注入
- チーム機能(メンバー招待と 6 種ロールの権限管理)

技術スタックは Next.js 15(App Router)+ NestJS 11 + Prisma 6 + PostgreSQL(pgvector)、認証は Clerk、課金は Stripe、AI は Claude(Sonnet / Haiku)+ OpenAI Embeddings、インフラは Vercel + AWS App Runner + RDS を Terraform で構築しています。

実際の画面はこんな流れです。アイデア検証 → プロダクト診断 → LP 生成 → 告知配信。

![Neorie のデモ](/images/neorie/neorie-demo.gif)

以下、順に判断を振り返ります。

---

## 判断① テナント分離を「気をつける」で守らない

マルチテナント SaaS で最初に決めるのは分離方式です。選択肢は 3 つあります。

| 方式   | 概要                                        | よく挙がる例                |
| ------ | ------------------------------------------- | --------------------------- |
| Pool   | 全テナント共有 DB、各テーブルに `tenantId`  | Slack、初期の Notion        |
| Bridge | 共有 DB、テナントごとに PostgreSQL スキーマ | 一部のエンタープライズ SaaS |
| Silo   | テナントごとに DB                           | 規制業界向け                |

個人開発者向けは**小さいテナントが大量に発生する**構造なので、Bridge / Silo は運用コストが見合いません。Pool を選びました。

問題は Pool の弱点です。`WHERE tenantId = ?` を 1 か所書き忘れたら他社のデータが見えます。「気をつける」で守れる性質のものではありません。

### Prisma Client Extension で自動注入する

そこで、`tenantId` を持つモデルへのクエリには Prisma Client Extension で自動的に条件を差し込むようにしました。

```ts
const TENANT_SCOPED_MODELS = new Set<string>([
  'Project',
  'ChecklistItem',
  'ProjectDocument',
  'AIUsage',
  'InvitationToken',
  'LandingPage',
  'ServiceScore',
  'IdeaValidation',
  'RagQaSession',
  'RagQaMessage',
  'Announcement',
  'Delivery',
  'BlogPost',
]);

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_SCOPED_MODELS.has(model)) return query(args);
        const tenantId = getTenantId(); // AsyncLocalStorage から取得
        if (!tenantId) return query(args);
        return query(injectTenantId(operation, args, tenantId));
      },
    },
  },
});
```

`injectTenantId` は操作の種類で差し込み先を変えます。読み取り・更新・削除は `where` に、`create` は `data` に、`upsert` は `where` と `create` の両方に入れます。`extendedWhereUnique` は Prisma 5 で GA になっているので、`findUnique` の `where` にも非ユニークフィールドを足せます。

`tenantId` の伝搬には AsyncLocalStorage を使っています。リクエストの入口で 1 回積めば、Service 層は `tenantId` を意識せずに書けます。

### 「明示された tenantId」と「コンテキストの tenantId」がズレたら落とす

自動注入で地味に効いたのがこの実装です。

```ts
function mergeTenantId(obj: Record<string, unknown> | undefined, tenantId: string) {
  const existing = obj?.tenantId;
  if (typeof existing === 'string' && existing !== tenantId) {
    throw new Error(
      `tenant mismatch: ${existing} (specified in query/data) vs ${tenantId} (request tenant context)`,
    );
  }
  return { ...(obj ?? {}), tenantId };
}
```

食い違ったら、黙って上書きせず例外にします。これは「バグ」か「テナント越境の試み」のどちらかで、静かに直してしまうと**間違ったコードが動き続ける**からです。同じ値の明示は許容します(後述の path slug ルートと共存させるため)。

### 自動注入が効かない穴は 2 つある

Extension は万能ではありません。穴は 2 か所ありました。

**1 つ目は raw SQL です。** ベクトル検索のように Prisma の型付きクエリで書けない箇所は `$queryRaw` を使うしかなく、そこには Extension が効きません。ここは ESLint のカスタムルールで塞ぎました。

```js
// eslint-rules/no-raw-sql-without-tenant-filter.js
// $queryRaw / $queryRawUnsafe / $executeRaw / $executeRawUnsafe のうち、
// SQL 文に tenantId(または tenant_id)を含まないものを検出する
```

意図的にテナント非依存なクエリ(`User` テーブル、`CREATE EXTENSION` など)は `eslint-disable-next-line` に**理由を必ず書く**運用にしています。「なぜ例外なのか」がコードに残るので、後から読んで判断できます。

**2 つ目は URL 由来のテナント解決です。** Neorie は `neorie.com/w/{slug}` というサブパス方式でワークスペースを表します。この経路は「まだテナントが確定していない状態」でリクエストが始まるので、AsyncLocalStorage にはまだ何も入っていません。そのため、`workspaces/:slug/...` 配下の Service は引数で受け取った `tenantId` を全クエリに明示注入する規約にしています。

自動注入は**安全側の既定値**であって、規約を消してくれるものではないという整理です。

なお、所属していない slug にアクセスされたときは 403 ではなく **404** を返します。403 だと「そのワークスペースは存在する」という情報が漏れるためです。

---

## 判断② RAG が構造的に成立しないと気づいた話

これは失敗の話です。

当初の売りは「使い込むほど、あなたの文体・構成に寄っていく AI 生成」でした。過去に書いた README や LP を pgvector で意味検索し、新規生成時にコンテキストとして注入する設計です。

実装は素直に終わりました。問題は、**テナント内にデータが貯まらない**ことでした。

| ターゲット   | 年間プロジェクト数 | 1 プロジェクトの文書数 | 1 年後の累積 |
| ------------ | ------------------ | ---------------------- | ------------ |
| 個人開発者   | 5〜10 件           | 4〜6 種 × 版           | 30〜60 件    |
| 小規模チーム | 10〜30 件          | 同上                   | 80〜200 件   |

意味検索が「似た事例から学ぶ」効果を出すには、体感で数百〜数千件は要ります。数十件では、上位 3 件を引いても「なんとなく関係ある文書」しか返りません。つまり**ターゲットの規模上、永続的にコールドスタート**でした。新規ユーザーにとっては「ただの Claude 生成」と区別がつきません。

### クロステナント RAG は選べなかった

データ量だけ見れば、全テナント横断で検索すれば解決します。実際に検討はしました。しかし B2B SaaS では取れません。

- ドキュメントには API キー・内部仕様・競合分析・顧客名が書かれうる。それが他人の生成コンテキストに載る = 直接の漏洩
- 原文を返さなくても、AI が要約して再生成すれば元の内容は推測できる。プロンプトインジェクションでコンテキストを吐かせることもできる
- 自分たちで ESLint ルールまで作って守ってきた分離設計を、自分で破ることになる
- 公開情報を見る限り、Notion AI や Slack AI も他テナントのデータは参照しない。B2B のデファクトから外れる

「うちの資料が他社の AI 生成に使われる」と知られた時点で契約は取れません。ここは即座に却下しました。

### 着地:運営がキュレーションした seed テナント

最終的に採ったのは、**`SEED_PUBLIC` という特別なテナントを 1 つ作り、オープンライセンスの良質な README を運営が投入する**方式です。検索範囲は「自テナント + seed テナント」の OR にします。

```ts
const tenantFilter =
  includeSeed && tenantId !== SEED_PUBLIC_TENANT_ID
    ? Prisma.sql`"tenantId" IN (${tenantId}, ${SEED_PUBLIC_TENANT_ID})`
    : Prisma.sql`"tenantId" = ${tenantId}`;

// embedding <=> $vec::vector で cosine distance、昇順で類似上位を取る
```

初期コーパスは Hono / Zod / Drizzle / Astro / tRPC / Trigger.dev の README(MIT / Apache-2.0)です。これで、

- ユーザーのプライベートデータは一切使わないという原則を保てる
- 新規ユーザーでも初回から「良い README のお手本」が効く
- 使い込めば自分の文書が上位に来るので、当初の体験にも接続する

という形に収まりました。検索結果には `isSeed` フラグを持たせ、UI 側で「サンプルテンプレートを参考にしています」と出せるようにしています。参照元を隠さないことは、この方式では必須だと思っています。

**教訓としては、「RAG を実装できるか」ではなく「そのプロダクトのデータ量で RAG が効くか」を先に見積もるべきでした。** 実装が終わってから気づくと、差別化の柱を作り直すことになります。

---

## 判断③ トークン従量課金をユーザーに見せない

AI 機能を課金プロダクトに載せるとき、原価は入力・出力トークンで動きます。しかしそれをそのままユーザーに見せると、「この操作でいくらかかるのか」が事前にわかりません。使うたびに不安になるプロダクトは使われません。

そこで **AI クレジット制**にしました。モデルごとに重みを決め、機能実行ごとに固定のクレジットを消費します。

```ts
export const MODEL_CREDITS: Record<string, number> = {
  [AI_MODEL_HAIKU]: 1, // 構造化中心(チェックリスト生成 / タスク分解 / 推敲)
  [AI_MODEL_SONNET]: 3, // 品質重視(ドキュメント生成 / 壁打ち / 検証・診断)
};
```

重みは実コスト比に合わせてあります。プラン上限は Pro が月 300 クレジット、Team が 1 席あたり 800 クレジットです。UI 側では実行ボタンの横に「3 cr 消費(残り 273 cr / 月)」と出しています。

裏方の embedding 呼び出しは `Feature.OTHER` として 0 クレジットで記録します。記録は残しつつ上限判定からは自然に外れるので、ユーザーが見る「残りクレジット」と実際の減り方が一致します。

### 同時実行でクレジット上限を超える問題(TOCTOU)

素朴に実装すると、こうなります。

1. 今月の消費量を集計する
2. 上限を超えないか確認する
3. AI を呼ぶ
4. 実績を記録する

2 と 4 の間に別のリクエストが入ると、両方とも「まだ上限内」と判定して両方通ります。典型的な TOCTOU です。上限 300 のところを 306 まで使われる程度なら実害は小さいですが、原価が出ていく箇所なので塞ぎました。

**AI 呼び出しの前にクレジットを「予約」する**方式にしています。

```ts
return this.prisma.$transaction(async (tx) => {
  // 同一テナントの予約を直列化する(トランザクション終了時に自動解放)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenant.id})::bigint)`;

  const agg = await tx.aIUsage.aggregate({
    where: { tenantId: tenant.id, createdAt: { gte: periodStart } },
    _sum: { credits: true },
  });
  const used = agg._sum.credits ?? 0;
  if (used + cost > limit) {
    throw new ForbiddenException(`月次 AI クレジット上限(${limit})に達しました。`);
  }

  // tokens = 0 のまま予約行を INSERT。credits は即座に used に反映される
  const row = await tx.aIUsage.create({ data: { /* ... */ credits: cost } });
  return row.id;
});
```

PostgreSQL の `pg_advisory_xact_lock` を `tenantId` をキーにして取るので、**同じテナントの予約だけ**が直列化されます。テーブルロックではないので他テナントには影響しません。トランザクション終了で自動解放されるため、解放漏れの心配もありません。

予約行は `tokens = 0` で INSERT され、集計にはすぐ効きます。AI が成功したら実トークン数を確定(`finalizeReservation`)、失敗したら予約行を削除(`releaseReservation`)します。呼び出し側は `withCreditReservation` というラッパーを使うだけで、try/catch の重複を書かずに済みます。

```ts
await this.aiUsage.withCreditReservation(tenant, usage, async () => {
  return this.anthropic.client.messages.create({
    /* ... */
  });
});
```

「先に予約して、後で確定する」という発想は在庫引当と同じです。AI 課金でも素直に効きました。

---

## 判断④ `tool_choice` を強制したら Web Search が呼ばれなかった

リリース前の動作確認で見つけた、いちばん危なかったバグです。

Neorie にはアイデア検証とプロダクト診断という機能があり、どちらも「Web で類似プロダクトを調べて、スコアと改善提案を構造化して返す」ものです。実装は自然にこう書きました。

```ts
// 旧実装(バグ)
const res = await this.anthropic.client.messages.create({
  model: AI_MODEL_SONNET,
  tools: [WEB_SEARCH_TOOL, SUBMIT_IDEA_VALIDATION_TOOL],
  tool_choice: { type: 'tool', name: SUBMIT_IDEA_VALIDATION_TOOL.name }, // ← これ
  messages: [{ role: 'user', content: prompt }],
});
```

構造化出力が欲しいので `tool_choice` で submit ツールを名指ししています。動きます。スコアも提案も返ってきます。

しかし**競合参照が毎回空**でした。`competitorRefs = []`、`webSearchUsed = false` のまま結果が保存されていました。

原因は、`tool_choice` で特定ツールを名指しすると、**モデルはその 1 手だけを打つ**ことです。Web Search を挟んでから submit する、という複数手の余地がなくなります。ツールの定義には載っているので気づきにくく、「Web 検索した体で、学習知識だけから採点する」という最悪の挙動になっていました。差別化のコアが、静かに死んでいたわけです。

### 2 ターンに分ける

修正は素直で、調査と採点を分けました。

```ts
// ターン 1: 調査に専念させる(tool_choice は auto)
const turn1 = await this.anthropic.client.messages.create({
  tools: [WEB_SEARCH_TOOL],
  tool_choice: { type: 'auto' },
  messages: [{ role: 'user', content: researchPrompt }],
});

// ターン 2: ターン 1 の結果を context に載せて構造化出力させる
const turn2 = await this.anthropic.client.messages.create({
  tools: [SUBMIT_IDEA_VALIDATION_TOOL],
  tool_choice: { type: 'tool', name: SUBMIT_IDEA_VALIDATION_TOOL.name },
  messages: [
    { role: 'user', content: researchPrompt },
    { role: 'assistant', content: turn1.content }, // 検索結果ブロックごと渡す
    { role: 'user', content: scoringPrompt },
  ],
});
```

ターン 1 の `assistant.content` を丸ごと(`server_tool_use` と `web_search_tool_result` のブロックを含めて)次のターンに渡すのがポイントです。要約して渡すと、せっかく取った出典 URL が落ちます。

ターン 1 のプロンプトには「採点はしないでください」と明示しています。放っておくと調査ターンで結論まで出してしまい、ターン 2 が形骸化するためです。

修正後は、競合を実名で挙げたうえでスコアが出るようになりました。

![アイデア検証の結果。Web 検索あり のバッジと、競合を踏まえた講評が入っている](/images/neorie/idea-validation.jpg)

### 副作用:クレジット単価を上げた

API 呼び出しが 2 回になったので原価も倍です。ここは**ユーザーの消費クレジットも 3 cr → 6 cr に上げました**。

```ts
// turnCount は 1 機能あたりの API call 回数。2-step 機能は 2 を渡す
export function creditsForUsage(model: string, feature: Feature, turnCount = 1): number {
  if (feature === Feature.OTHER) return 0;
  const override = FEATURE_CREDIT_OVERRIDES[feature];
  if (override !== undefined) return override * turnCount;
  return (MODEL_CREDITS[model] ?? FALLBACK_MODEL_CREDITS) * turnCount;
}
```

「ユーザーから見えるクレジット」と「実 API コール回数」を一致させておくと、後でプラン設計を見直すときに原価計算がそのまま使えます。ここを曖昧にすると、赤字の機能に気づけません。

**教訓は、AI 機能は「動いた」だけでは検証にならないということです。** レスポンスの形が正しくても、意図した経路を通っていないことがあります。`webSearchUsed` のような**経路そのものを記録するフィールド**を最初から持たせて、それを受け入れ確認の観点にすべきでした。

---

## 判断⑤ 人数課金は「DB コミット後の Saga」で寄せる

Team プランは 1 人あたり月額で、人数は Stripe の Subscription Quantity で表します。メンバーが増減したら Stripe 側の数量も合わせる必要があります。

素直に考えると「メンバー追加と Stripe 更新を 1 つのトランザクションに入れたい」となりますが、外部 API はトランザクションに入りません。Stripe が失敗したときに DB をロールバックすると、今度は「招待は承諾されたのにメンバーになっていない」という、ユーザーから見て意味不明な状態になります。

そこで **3 層構成**にしました。

**第 1 層(即時)**: DB のトランザクションをコミットしてから、Saga の forward step として Stripe を更新します。

```ts
async syncSubscriptionQuantity(tenantId: string): Promise<void> {
  const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub || sub.plan !== Plan.TEAM || !sub.stripeSubId) return; // FREE / PRO は no-op

  const seats = await this.prisma.tenantMember.count({ where: { tenantId } });
  const stripeSub = await this.stripe.client.subscriptions.retrieve(sub.stripeSubId);
  const itemId = stripeSub.items.data[0]?.id;

  await this.stripe.client.subscriptions.update(sub.stripeSubId, {
    items: [{ id: itemId, quantity: seats }],
  });
  await this.prisma.subscription.update({ where: { tenantId }, data: { quantity: seats } });
}
```

呼び出し側は try/catch で囲み、**失敗してもユーザー操作は成功扱い**にします。「メンバーは増えたが Stripe の数量が古い」は数分〜1 日で解消できるズレであり、ユーザー体験を壊してまで守る不変条件ではない、という判断です。

このメソッドは冪等です。同じ `quantity` を何度送っても結果が変わらないので、リトライや二重呼び出しが安全になります。**外部 API 連携は冪等に寄せておくと、リカバリ設計が一気に楽になります。**

**第 2 層(受信)**: Stripe からの Webhook で自前 DB を上書きします。冪等性は `event.id` をユニーク制約付きのテーブルに保存して担保します。Stripe は同じイベントを複数回送ることがある(送達保証はしても重複排除はしない)ので、ここは必須です。

**第 3 層(照合)**: 日次バッチで `TenantMember.count` と Stripe の `quantity` を突き合わせ、ズレていたら再同期する。これは v1.x 送りにしています。第 1 層と第 2 層で実用上は揃うため、MVP には要らないと判断しました。

「即時同期 + 受信同期 + 定期照合」の 3 層は、外部課金と自前 DB を持つプロダクトではほぼ定番になると思います。**最初から 3 層あるつもりで設計して、実装は 2 層から始める**のがちょうど良い塩梅でした。

---

## 判断⑥ 本番だけが壊れる:環境変数の 3 経路

最後は運用の話です。個人開発でいちばん時間を溶かしたのはここでした。

Neorie は Web を Vercel、API を AWS App Runner に置いています。この時点で、環境変数の経路が完全に 2 系統に分かれます。

```
ブラウザ
   ↓
Vercel(Next.js)        ← 環境変数は Vercel ダッシュボード
   ↓ サーバー間通信
App Runner(NestJS)     ← 環境変数は Secrets Manager + apprunner.tf
   ↓
RDS
```

**Vercel は Secrets Manager を読めず、App Runner は Vercel の環境変数を読めません。** そして反映方法も違います。

|            | 反映方法                         | 理由                           |
| ---------- | -------------------------------- | ------------------------------ |
| Vercel     | 再デプロイ                       | ビルド成果物に埋め込まれる     |
| App Runner | `aws apprunner start-deployment` | 起動時にシークレットを解決する |

どちらも「ダッシュボードで値を更新しただけでは反映されない」のですが、理由が違うので対処も違います。

### 実際に踏んだ事故

`CLERK_WEBHOOK_SECRET` という変数を追加したとき、`.env.example` とコードには書いたのに、**Terraform の `secrets.tf` に足し忘れました**。

ローカルは正常に動きます。型チェックも通ります。CI も通ります。壊れるのは本番だけで、しかも壊れ方は「`POST /webhooks/clerk` が 500 を返し続け、ユーザーのプロビジョニングが静かに止まる」という、画面を見ていても気づかないものでした。

本番構築の作業中にたまたま気づけましたが、完全に運任せでした。再発防止として、環境変数を足すときの判断フローをドキュメントに明文化しました。

```
その環境変数は誰が読む?
├ API(NestJS)が読む
│  ├ 機密 → ① .env.example ② .env.local
│  │        ③ infra/prod/secrets.tf の app_secret_keys  ← 忘れると本番だけ壊れる
│  │        ④ Secrets Manager への実値投入(手動)      ← 忘れると起動しない
│  └ 非機密 → ①② + infra/prod/apprunner.tf の runtime_environment_variables
└ Web(Next.js)が読む
   → ①② + Vercel の環境変数(追加後に再デプロイ)
```

ついでに気づいた運用上のポイントも書き添えています。

- **機密でない値を Secrets Manager に入れない。** シークレット単位で月額課金が発生します。URL やフラグは `apprunner.tf` に直接書きます
- **`NEXT_PUBLIC_` を付けた値はバンドルに埋め込まれ、ブラウザから見えます。** API のベース URL にあえて付けていないのは、ブラウザから直接 API を叩かせず Server Component / Server Action 経由に限定するためです
- **エラーにならない未設定がいちばん怖い。** サイト URL のように「未設定でもフォールバックして動いてしまう」変数は、OG 画像や sitemap が静かに壊れます

**「ローカルで動く」と「本番で動く」の間にある距離を、ドキュメントで埋めるしかない**というのが結論でした。型システムはここまで守ってくれません。

---

## まとめ

6 つに共通していたのは、**「注意して書く」で守れる範囲は思ったより狭い**ということでした。

テナント分離は Client Extension と ESLint ルールに、クレジット上限は DB のロックに、外部連携の整合は冪等性と再同期に寄せる。人間が毎回思い出す前提の設計は、いつか必ず抜けます。

一方で判断⑥だけは逆で、**コードの外にある問題は型でもテストでも守れません**。環境変数はドキュメントと判断フローで埋めるしかありませんでした。

個人開発だと「とりあえず動かす」で進めがちですが、あとから構造を入れ直すのが高くつくもの(テナント分離、課金、AI の原価計算)は、最初に決めておくと後半が楽になります。

## 作ったもの

記事で扱った Neorie は先日公開しました。アイデア検証・プロダクト診断・README / LP 生成・告知文の生成までを 1 か所で回せます。新規登録から 7 日間、Pro の全機能をクレジットカード登録なしで試せます。

- サービス: https://neorie.com

![Neorie のランディングページ](/images/neorie/landing.jpg)

個人開発中のプロダクトがある方は、アイデア検証あたりから触ってみてもらえると嬉しいです。質問や「ここをもっと詳しく」があれば、コメントで教えてください。
