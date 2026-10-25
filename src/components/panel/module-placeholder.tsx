import { Badge, Card } from "@/components/ui/primitives";

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted">{description}</p>}
    </div>
  );
}

export function ModulePlaceholder({ title, milestone, scope }: { title: string; milestone: string; scope: string[] }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="max-w-2xl space-y-3">
        <Badge>W budowie · {milestone}</Badge>
        <p className="text-sm text-muted">Ten moduł powstaje w etapie {milestone}. Zakres:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {scope.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}
