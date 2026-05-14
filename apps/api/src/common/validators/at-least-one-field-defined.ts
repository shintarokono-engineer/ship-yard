import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * 「指定した複数フィールドのうち少なくとも 1 つが `undefined` でない」ことを検証するクロスフィールド validator。
 *
 * 部分更新 DTO で「`title` または `content` のいずれかが必須」のような制約を **DTO 側で完結** させたいときに使う。
 * Service にバリデーションロジックを書くとデータ形状検証(class-validator)とドメイン検証が混じるため、
 * 純粋なリクエスト形状チェックは DTO に集約する。
 *
 * 使い方: クラス内のダミー private プロパティに付けて、`fields` で対象フィールド名を列挙する。
 * デコレータの宿主プロパティ自体の値は参照されず、`args.object` を通して DTO 全体を見て判定する。
 *
 * @example
 * ```ts
 * export class UpdateProjectDocumentDto {
 *   @IsOptional() @IsString() title?: string;
 *   @IsOptional() @IsString() content?: string;
 *
 *   // ダミー: 値を持たない宣言、@AtLeastOneFieldDefined を載せる宿主
 *   @AtLeastOneFieldDefined(['title', 'content'])
 *   private readonly _atLeastOne!: never;
 * }
 * ```
 *
 * @param fields 対象フィールド名の配列(少なくとも 1 つが `undefined` でないこと)
 * @param validationOptions class-validator 標準の `ValidationOptions`(`message` を上書きしたいとき等)
 */
export function AtLeastOneFieldDefined(
  fields: readonly string[],
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'atLeastOneFieldDefined',
      target: object.constructor,
      propertyName,
      constraints: [fields],
      options: {
        message: `${fields.join(' または ')} のいずれかを指定してください`,
        ...validationOptions,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const [fieldNames] = args.constraints as [readonly string[]];
          const obj = args.object as Record<string, unknown>;
          return fieldNames.some((f) => obj[f] !== undefined);
        },
      },
    });
  };
}
