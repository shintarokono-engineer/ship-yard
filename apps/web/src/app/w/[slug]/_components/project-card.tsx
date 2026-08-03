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
      aria-label={project.name}
      className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-[3px]"
    >
      {/* 概要が無いときは段落ごと省く(一覧では「概要がありません」を並べても情報が増えない)。
          CardContent が空になるので flex-col + flex-1 でフッターを底に揃える。 */}
      <Card className="hover:border-primary/40 flex h-full cursor-pointer flex-col transition-all hover:shadow-md motion-safe:hover:-translate-y-0.5 [&_*]:cursor-pointer">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base leading-none font-semibold">{project.name}</h2>
            <Badge variant={meta.badgeVariant} className={meta.badgeClassName}>
              {meta.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {project.description && (
            <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-wrap">
              {project.description}
            </p>
          )}
        </CardContent>
        {/* 狭い幅では 2 行に折り返す。日時は途中で切らない。 */}
        <CardFooter className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <span>
            ドキュメント {project._count.documents} / チェックリスト {project._count.checklist}
          </span>
          <span className="whitespace-nowrap">更新 {formatDateTime(project.updatedAt)}</span>
        </CardFooter>
      </Card>
    </Link>
  );
}
