import type { SceneTemplate } from './scene';

export interface SceneObjectState {
  object_id: string; room_id: string | null; state?: string; source: string | null;
  updated_at: string | null; availability: string; [key: string]: unknown;
}
export interface PlanItem { item_id: string; object_id: string; group: string; action: string; reason: string; }
export interface ExecutionItem { item_id: string; object_id: string; status: string; command_accepted?: boolean; readback_at?: string | null; }
export interface DemoView {
  objects: Record<string, SceneObjectState>;
  family: { user_away: boolean | null; retain_room_ids: string[] };
  task: null | { id: string; selected: string[]; activeExecutionId: string | null;
    plan: { plan_version: number; items: PlanItem[] };
    manual_records: { object_id: string; result: string; confirmed_at: string | null }[];
  };
}
export const sceneMapping: Record<string, any>;
export interface SandboxSession {
  readonly templateId: string;
  view(): DemoView; state(id: string): string; results(): ExecutionItem[]; pending(): number;
  subscribe(listener: () => void): () => void;
  plan(everyone: boolean): void; select(itemId: string, checked: boolean): void;
  execute(order: 'execution-first' | 'object-first'): void;
  next(): string | undefined; manual(result: 'confirmed_closed' | 'deferred'): void;
  userAway(): void; reset(): void; dispose(): void;
}
export function createSandboxSession(template?: Pick<SceneTemplate, 'templateId' | 'map'>): SandboxSession;
