import { Hammer } from "lucide-react";
import { PageHeader, Panel } from "@/components/panel/page";
import { Pill } from "@/components/ui/status";

export { PageHeader } from "@/components/panel/page";

export function ModulePlaceholder({ title, milestone, scope }: { title: string; milestone: string; scope: string[] }) {
  return (
    <>
      <PageHeader title={title} description={`Ten moduł powstaje w etapie ${milestone}. Poniżej zakres, który obejmie.`} />
      <Panel className="max-w-2xl">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <Hammer className="size-5" />
          </span>
          <div className="space-y-3">
            <Pill tone="warning">W budowie, etap {milestone}</Pill>
            <ul className="space-y-1.5 text-sm">
              {scope.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-subtle" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </>
  );
}
