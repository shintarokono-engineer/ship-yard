import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { PROJECT_STATUS_META, type Project } from '@/lib/api/types';

export function ProjectCard({ slug, project }: { slug: string; project: Project }) {
  const meta = PROJECT_STATUS_META[project.status];

  return (
    <Link
      href={`/w/${slug}/projects/${project.id}`}
      className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
    >
      <Card className="hover:bg-accent/30 h-full transition-colors">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base leading-none font-semibold">{project.name}</h2>
            <Badge variant={meta.badgeVariant} className={meta.badgeClassName}>
              {meta.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {project.description ? (
            <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-wrap">
              {project.description}
            </p>
          ) : (
            <p className="text-muted-foreground/70 text-sm italic">(説明なし)</p>
          )}
        </CardContent>
        <CardFooter className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            ドキュメント {project._count.documents} / チェックリスト {project._count.checklist}
          </span>
          <span>更新 {formatDateTime(project.updatedAt)}</span>
        </CardFooter>
      </Card>
    </Link>
  );
}
