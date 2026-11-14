import { DeviceStateStore, deviceTelemetry } from '../../../sandbox-prototype/house-modeling/viewer/state-provider.js';
import map from '../../../sandbox-prototype/house-modeling/releases/large-flat-128/object-map.actual.json' with { type: 'json' };
import fixtures from '../../../sandbox-prototype/house-modeling/releases/large-flat-128/state-fixtures.json' with { type: 'json' };
import modelUrl from '../../../sandbox-prototype/house-modeling/releases/large-flat-128/future-home-large-flat-128-v0.2.glb?url';

export const largeFlat = { templateId: map.template_id, modelUrl, map };
export const largeFlatSamples = ['baseline', 'fridge_partial_offline', 'offline'];

/** Fresh local demonstration state for each visit to this template. */
export function createLargeFlatSession() {
  const snapshot = id => {
    const sample = largeFlatSamples.includes(id) && fixtures.scenarios.find(entry => entry.id === id);
    if (!sample || sample.snapshot.demo_mode !== true) throw new Error('Invalid local sample');
    return sample.snapshot;
  };
  const store = new DeviceStateStore({
    templateId: largeFlat.templateId,
    objectDefinitions: map.objects,
    initialSnapshot: snapshot('baseline'),
  });
  return {
    objects: () => store.getSnapshot().objects,
    selectSample: id => store.replaceSnapshot(snapshot(id)),
    subscribe: listener => store.subscribe(listener, { immediate: false }),
  };
}

export { deviceTelemetry };
