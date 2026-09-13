import { Loader2Icon } from 'lucide-react';

// shadcn CLI が alias を誤解決して `from "cn"` を生成するため手で直している。再生成時は要確認。
import { cn } from '@/lib/utils';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
