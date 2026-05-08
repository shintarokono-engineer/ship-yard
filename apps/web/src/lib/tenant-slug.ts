// テナント slug の形式制約(ADR-003 / docs/data-model.md `Tenant.slug`)
// 英数字(小文字)+ ハイフン、3〜30 文字
const SLUG_FORMAT_REGEX = /^[a-z0-9-]{3,30}$/;

export function isValidTenantSlug(slug: string): boolean {
  return SLUG_FORMAT_REGEX.test(slug);
}

// 下流(Server Component / Route Handler)へ伝搬するヘッダー名(ADR-003)
export const TENANT_SLUG_HEADER = 'X-Tenant-Slug';
