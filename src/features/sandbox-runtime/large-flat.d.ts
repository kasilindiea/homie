import type { SceneObjectDefinition, SceneTemplate } from './scene';
import type { SceneObjectState } from './session';

export const largeFlat: SceneTemplate;
export const largeFlatSamples: readonly string[];
export function createLargeFlatSession(): {
  objects(): Record<string, SceneObjectState>;
  selectSample(id: string): void;
  subscribe(listener: () => void): () => void;
};
export function deviceTelemetry(record: SceneObjectState, definition: SceneObjectDefinition): {
  key: string;
  label: string;
  value: string;
  secondary?: string;
  availability: string;
  source: string | null;
  updated_at: string | null;
}[];
