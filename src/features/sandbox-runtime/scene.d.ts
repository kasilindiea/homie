export interface HomeScene {
  focus(id: string): void;
  reset(immediate?: boolean): void;
  preview(ids: readonly string[]): void;
  apply(objects: Record<string, any>): void;
  setLabels(mode: 'all' | 'clean' | 'hidden'): void;
  setActive(active: boolean): void;
  destroy(): void;
  inspect(): { selected: string | null; planIds: string[]; lastPick: string | null; animation: any; camera: number[]; target: number[]; emissive: number; active: boolean; destroyed: boolean; renderedFrames: number };
}

export interface HomeSceneOptions {
  signal?: AbortSignal;
  canvasLabel?: string;
  labels?: Record<string, string>;
  stateLabel?: (id: string, state: string) => string;
  onContextLost?: () => void;
}

export function createHomeScene(host: HTMLElement, map: any, onSelect: (id: string | null) => void, options?: HomeSceneOptions): Promise<HomeScene>;
