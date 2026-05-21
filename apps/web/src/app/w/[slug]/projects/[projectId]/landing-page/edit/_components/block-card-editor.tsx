import { memo, type ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FeaturesBlock, FooterBlock, LpBlock, StatsBlock } from '@/lib/api/types';

import { LP_BLOCK_TYPE_LABEL } from '../../_shared/lp-edit';

/** 1 フィールド分のラベル付きテキスト入力(controlled)。`required` 時は空欄を `aria-invalid` で示す。 */
function TextField({
  id,
  label,
  value,
  onChange,
  required,
  multiline,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const invalid = required === true && value.trim().length === 0;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive ml-0.5">
            *
          </span>
        )}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          rows={3}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      ) : (
        <Input
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      )}
      {invalid && (
        <p id={errorId} className="text-destructive text-xs">
          この項目は必須です。
        </p>
      )}
    </div>
  );
}

/** items / links を 1 項目ぶん囲う枠。 */
function ItemGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      {children}
    </div>
  );
}

/**
 * ブロック種別ごとのテキストフィールド群。判別ユニオンを switch で分岐し、各 `case` で型が
 * 個別ブロックへ narrow された状態でフィールドを並べる。変更後のブロックを `onChange` で返す。
 */
function BlockFields({
  block,
  prefix,
  disabled,
  onChange,
}: {
  block: LpBlock;
  prefix: string;
  disabled: boolean;
  onChange: (next: LpBlock) => void;
}) {
  switch (block.type) {
    case 'hero':
      return (
        <>
          <TextField
            id={`${prefix}-heading`}
            label="見出し"
            required
            disabled={disabled}
            value={block.heading}
            onChange={(v) => onChange({ ...block, heading: v })}
          />
          <TextField
            id={`${prefix}-sub`}
            label="サブコピー"
            multiline
            disabled={disabled}
            value={block.sub}
            onChange={(v) => onChange({ ...block, sub: v })}
          />
          <TextField
            id={`${prefix}-ctaText`}
            label="CTA ボタンの文言"
            required
            disabled={disabled}
            value={block.ctaText}
            onChange={(v) => onChange({ ...block, ctaText: v })}
          />
          <TextField
            id={`${prefix}-ctaHref`}
            label="CTA リンク先"
            required
            disabled={disabled}
            value={block.ctaHref}
            onChange={(v) => onChange({ ...block, ctaHref: v })}
          />
          <TextField
            id={`${prefix}-image`}
            label="ヒーロー画像 URL(任意)"
            disabled={disabled}
            value={block.image ?? ''}
            onChange={(v) => onChange({ ...block, image: v || undefined })}
          />
        </>
      );

    case 'features': {
      const setItem = (j: number, patch: Partial<FeaturesBlock['items'][number]>) =>
        onChange({
          ...block,
          items: block.items.map((it, k) => (k === j ? { ...it, ...patch } : it)),
        });
      return (
        <>
          <TextField
            id={`${prefix}-title`}
            label="セクション見出し"
            disabled={disabled}
            value={block.title}
            onChange={(v) => onChange({ ...block, title: v })}
          />
          {block.items.map((item, j) => (
            <ItemGroup key={j} label={`機能 ${j + 1}`}>
              <TextField
                id={`${prefix}-item-${j}-icon`}
                label="アイコン(絵文字)"
                disabled={disabled}
                value={item.icon}
                onChange={(v) => setItem(j, { icon: v })}
              />
              <TextField
                id={`${prefix}-item-${j}-title`}
                label="タイトル"
                required
                disabled={disabled}
                value={item.title}
                onChange={(v) => setItem(j, { title: v })}
              />
              <TextField
                id={`${prefix}-item-${j}-body`}
                label="説明"
                multiline
                disabled={disabled}
                value={item.body}
                onChange={(v) => setItem(j, { body: v })}
              />
            </ItemGroup>
          ))}
        </>
      );
    }

    case 'stats': {
      const setItem = (j: number, patch: Partial<StatsBlock['items'][number]>) =>
        onChange({
          ...block,
          items: block.items.map((it, k) => (k === j ? { ...it, ...patch } : it)),
        });
      return (
        <>
          {block.items.map((item, j) => (
            <ItemGroup key={j} label={`数値 ${j + 1}`}>
              <TextField
                id={`${prefix}-item-${j}-value`}
                label="数値(例: 1,200+)"
                required
                disabled={disabled}
                value={item.value}
                onChange={(v) => setItem(j, { value: v })}
              />
              <TextField
                id={`${prefix}-item-${j}-label`}
                label="ラベル"
                required
                disabled={disabled}
                value={item.label}
                onChange={(v) => setItem(j, { label: v })}
              />
            </ItemGroup>
          ))}
        </>
      );
    }

    case 'testimonial':
      return (
        <>
          <TextField
            id={`${prefix}-quote`}
            label="引用文"
            required
            multiline
            disabled={disabled}
            value={block.quote}
            onChange={(v) => onChange({ ...block, quote: v })}
          />
          <TextField
            id={`${prefix}-name`}
            label="発言者の名前"
            disabled={disabled}
            value={block.name}
            onChange={(v) => onChange({ ...block, name: v })}
          />
          <TextField
            id={`${prefix}-role`}
            label="発言者の肩書"
            disabled={disabled}
            value={block.role}
            onChange={(v) => onChange({ ...block, role: v })}
          />
          <TextField
            id={`${prefix}-avatar`}
            label="アバター画像 URL(任意)"
            disabled={disabled}
            value={block.avatar ?? ''}
            onChange={(v) => onChange({ ...block, avatar: v || undefined })}
          />
        </>
      );

    case 'cta':
      return (
        <>
          <TextField
            id={`${prefix}-heading`}
            label="見出し"
            required
            disabled={disabled}
            value={block.heading}
            onChange={(v) => onChange({ ...block, heading: v })}
          />
          <TextField
            id={`${prefix}-buttonText`}
            label="ボタンの文言"
            required
            disabled={disabled}
            value={block.buttonText}
            onChange={(v) => onChange({ ...block, buttonText: v })}
          />
          <TextField
            id={`${prefix}-buttonHref`}
            label="ボタンのリンク先"
            required
            disabled={disabled}
            value={block.buttonHref}
            onChange={(v) => onChange({ ...block, buttonHref: v })}
          />
        </>
      );

    case 'footer': {
      const setLink = (j: number, patch: Partial<FooterBlock['links'][number]>) =>
        onChange({
          ...block,
          links: block.links.map((l, k) => (k === j ? { ...l, ...patch } : l)),
        });
      return (
        <>
          <TextField
            id={`${prefix}-copyright`}
            label="著作権表記"
            disabled={disabled}
            value={block.copyright}
            onChange={(v) => onChange({ ...block, copyright: v })}
          />
          {block.links.map((link, j) => (
            <ItemGroup key={j} label={`リンク ${j + 1}`}>
              <TextField
                id={`${prefix}-link-${j}-label`}
                label="リンクの文言"
                required
                disabled={disabled}
                value={link.label}
                onChange={(v) => setLink(j, { label: v })}
              />
              <TextField
                id={`${prefix}-link-${j}-href`}
                label="リンク先"
                disabled={disabled}
                value={link.href}
                onChange={(v) => setLink(j, { href: v })}
              />
            </ItemGroup>
          ))}
        </>
      );
    }
  }
}

/**
 * 1 ブロックぶんの編集カード(ADR-009、Day 32)。
 *
 * `memo` でラップし、編集中ブロックの `block` prop だけが変わるようにすることで、1 フィールドの
 * 打鍵で全ブロックが再描画されるのを防ぐ。`onChange` は `(index, next)` を取る親の安定参照を
 * 受け取り、内部で index を束縛して `BlockFields` に渡す。ブロックの追加 / 削除 / 並び替えは v2。
 */
export const BlockCardEditor = memo(function BlockCardEditor({
  block,
  index,
  disabled,
  onChange,
}: {
  block: LpBlock;
  index: number;
  disabled: boolean;
  onChange: (index: number, next: LpBlock) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {index + 1}. {LP_BLOCK_TYPE_LABEL[block.type]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <BlockFields
          block={block}
          prefix={`block-${index}`}
          disabled={disabled}
          onChange={(next) => onChange(index, next)}
        />
      </CardContent>
    </Card>
  );
});
