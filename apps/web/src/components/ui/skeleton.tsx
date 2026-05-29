import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * shadcn/ui の Skeleton(F5、§9.12.2 観点 5)。
 *
 * Server Component の Suspense fallback(`loading.tsx`)で使う、データ取得中の
 * プレースホルダー表現。`animate-pulse` + `bg-accent` の最小実装。
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-accent', className)}
      {...props}
    />
  );
}

export { Skeleton };
