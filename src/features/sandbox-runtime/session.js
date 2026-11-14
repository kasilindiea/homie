import { ProductStore, currentState, executionItems } from '../../../sandbox-prototype/frontend/data-model.js';
import { LocalGateway } from '../../../sandbox-prototype/frontend/local-gateway.js';
import mapping from '../../../sandbox-prototype/house-modeling/releases/v0.1/object-map.actual.json' with { type: 'json' };
import catalog from '../../../sandbox-prototype/backend/离家检查联调样例.json' with { type: 'json' };

export const sceneMapping = mapping;

/** One offline demo per sandbox mount. Never reads or writes household storage. */
export function createSandboxSession() {
  const store = new ProductStore(mapping, catalog.baseline_snapshot);
  const gateway = new LocalGateway(catalog, store);
  let disposed = false;
  const active = action => { if (!disposed) return action(); };
  return {
    view: () => store.view(),
    state: id => currentState(store.view().objects[id]),
    results: () => executionItems(store.view()),
    pending: () => gateway.queue.length,
    subscribe: listener => store.subscribe(() => { if (!disposed) listener(); }),
    plan: everyone => active(() => gateway.createPlan({ everyone, intent: everyone ? '全员离家' : '我出门两小时，猫留在卧室。' })),
    select: (itemId, checked) => active(() => store.select(itemId, checked)),
    execute: order => active(() => {
      const task = store.view().task;
      if (!task) return;
      gateway.execute({ planVersion: task.plan.plan_version, selectedIds: task.selected,
        confirmationId: crypto.randomUUID(), order });
    }),
    next: () => active(() => gateway.next()),
    manual: result => active(() => gateway.manual(result)),
    userAway: () => active(() => gateway.userAway()),
    reset: () => active(() => gateway.reset()),
    dispose: () => { disposed = true; gateway.resetQueue(); store.listeners.clear(); },
  };
}
