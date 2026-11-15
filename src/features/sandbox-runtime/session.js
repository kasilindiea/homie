import { ProductStore, hasEvidence, executionItems } from '../../../sandbox-prototype/frontend/data-model.js';
import { LocalGateway } from '../../../sandbox-prototype/frontend/local-gateway.js';
import mapping from '../../../sandbox-prototype/house-modeling/releases/v0.1/object-map.actual.json' with { type: 'json' };
import catalog from '../../../sandbox-prototype/backend/离家检查联调样例.json' with { type: 'json' };
import extendedFixtures from '../../../sandbox-prototype/house-modeling/releases/large-flat-128/state-fixtures.json' with { type: 'json' };

export const sceneMapping = mapping;

const commonIds = ['entry_door', 'balcony_door', 'living_room_light', 'bedroom_ac'];
const clone = value => structuredClone(value);

/** Build an explicitly local catalog for this delivered model. The original
 * four-object away rules remain unchanged; extra devices are read-only samples.
 * Object membership and room IDs come from the selected model, never its label.
 */
function catalogFor(template) {
  if (template.templateId === 'baseline_apartment') return catalog;
  const definitions = template.map.objects.filter(object => object.object_type !== 'room');
  const ids = new Set(definitions.map(object => object.shared_id));
  if (commonIds.some(id => !ids.has(id))) throw new TypeError('此户型缺少离家演示所需的对象');
  const rooms = template.map.objects.filter(object => object.object_type === 'room').map(room => room.shared_id);
  const extra = extendedFixtures.scenarios.find(sample => sample.id === 'baseline').snapshot;
  const base = clone(catalog.baseline_snapshot);
  const occupancy = everyone => Object.fromEntries(rooms.map(id => [id, !everyone && id === 'bedroom' ? 'occupied' : 'empty']));
  base.template_id = template.templateId;
  base.objects = Object.fromEntries(definitions.map(definition => {
    const id = definition.shared_id;
    const sample = commonIds.includes(id) ? catalog.baseline_snapshot.objects[id] : extra.objects[id];
    return [id, { ...clone(sample ?? { availability:'stale', source:null, updated_at:null }), object_id:id, room_id:definition.room_id }];
  }));
  base.capabilities = Object.fromEntries(definitions.map(({shared_id:id}) => [id, commonIds.includes(id)
    ? clone(catalog.baseline_snapshot.capabilities[id])
    : { verification_scope:'simulation', allowed_actions:[], source:'simulator', updated_at:'2026-11-14T17:00:00+08:00' }]));
  base.context.room_occupancy = occupancy(false);
  // These models have no home battery: do not carry over storage-specific
  // household figures from the original apartment demonstration.
  if (base.energy?.measurements) for (const field of ['soc_pct', 'estimated_runtime_minutes']) delete base.energy.measurements[field];
  const scenarios = ['cat_home_baseline', 'everyone_away'].map(id => {
    const source = catalog.scenarios.find(sample => sample.id === id);
    const response = clone(source.steps.find(step => step.response?.body?.plan).response);
    const body = response.body;
    body.template_id = template.templateId;
    body.context.room_occupancy = occupancy(id === 'everyone_away');
    body.plan.items = body.plan.items.filter(item => commonIds.includes(item.object_id));
    return { id, steps:[{response}] };
  });
  return { template_id:template.templateId, demo_mode:true, baseline_snapshot:base, scenarios };
}

/** One independent template demo per sandbox lifetime. Never touches household storage. */
export function createSandboxSession(template = { templateId:'baseline_apartment', map:mapping }) {
  if (template.map.template_id && template.map.template_id !== template.templateId) throw new TypeError('户型与对象映射不匹配');
  const selectedCatalog = catalogFor(template);
  const store = new ProductStore({ ...template.map, template_id:template.templateId }, selectedCatalog.baseline_snapshot);
  const gateway = new LocalGateway(selectedCatalog, store);
  let disposed = false;
  const active = action => { if (!disposed) return action(); };
  return {
    get templateId() { return store.templateId; },
    view: () => store.view(),
    state: id => {
      const record = store.view().objects[id];
      return hasEvidence(record) ? record.state ?? record.cycle_state ?? record.door_state ?? record.cover_state ?? 'unknown' : 'unknown';
    },
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
