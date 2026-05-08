import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Shipyard</h1>
      <p className="text-muted-foreground text-lg">
        Day 4: Next.js 15 + React 19 + Tailwind CSS v4 + shadcn/ui 雛形が起動しています。
      </p>
      <div className="flex gap-3">
        <Button>
          <Rocket />
          Default
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
    </main>
  );
}
