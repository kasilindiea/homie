import { describe, expect, it, vi } from 'vitest';
import { SANDBOX_TEMPLATES, getSandboxTemplate } from '../src/features/sandbox-runtime/templates';
import { createSandboxSession } from '../src/features/sandbox-runtime/session.js';
import { ProductStore } from '../sandbox-prototype/frontend/data-model.js';
import { LocalGateway } from '../sandbox-prototype/frontend/local-gateway.js';

describe('independent apartment demo sessions', () => {
  for (const template of SANDBOX_TEMPLATES.slice(1)) {
    for (const order of ['execution-first', 'object-first'] as const) {
      it(`${template.templateId} accepts ${order} without lighting changes from command feedback`, () => {
        const session = createSandboxSession(template);
        try {
          expect(session.templateId).toBe(template.templateId);
          const initial = session.view();
          expect(Object.keys(initial.objects).sort()).toEqual(template.devices.map(object => object.shared_id).sort());
          for (const definition of template.devices) expect(initial.objects[definition.shared_id].room_id).toBe(definition.room_id);
          expect(initial.objects).not.toHaveProperty('home_battery');
          expect(initial.objects).not.toHaveProperty('study_light');
          expect(initial.objects).not.toHaveProperty('laundry_balcony_door');
          expect(initial.objects.washing_machine).toMatchObject({ room_id:'balcony', cycle_state:'running' });
          expect(initial.objects.dining_room_light.room_id).toBe(template.layoutId === 'two_bedroom' ? 'living_room' : 'dining_room');
          for (const id of ['washing_machine', 'kitchen_fridge', 'dining_room_light', 'living_room_tv', 'living_room_curtain']) {
            expect((initial as any).capabilities[id].allowed_actions).toEqual([]);
          }
          session.plan(false);
          expect(session.view().task!.plan.items.map(item => item.object_id).sort()).toEqual(['balcony_door', 'bedroom_ac', 'entry_door', 'living_room_light']);
          const extraBefore = initial.objects.washing_machine;
          session.execute(order);
          expect(session.results()[0].command_accepted).toBe(true);
          expect(session.state('living_room_light')).toBe('on');
          session.next();
          if (order === 'execution-first') {
            expect(session.results()[0].status).toBe('confirmed');
            expect(session.state('living_room_light')).toBe('on');
            session.next();
            expect(session.state('living_room_light')).toBe('unknown');
            expect(session.view().objects.living_room_light.updated_at).toBeNull();
            session.next();
          } else {
            expect(session.state('living_room_light')).toBe('off');
            expect(session.results()[0].status).toBe('awaiting_readback');
            session.next();
          }
          expect(session.state('living_room_light')).toBe('off');
          expect(session.results()[0].status).toBe('confirmed');
          expect(session.state('bedroom_ac')).toBe('on');
          expect(session.view().objects.washing_machine).toEqual(extraBefore);
          expect(session.pending()).toBe(0);
        } finally { session.dispose(); }
      });
    }
  }

  it('keeps each template independent and treats manual checking, departure and reset separately', () => {
    const sessions = SANDBOX_TEMPLATES.map(template => createSandboxSession(template));
    const storage = { getItem:vi.fn(), setItem:vi.fn() };
    vi.stubGlobal('localStorage', storage);
    try {
      const [one, two, three] = sessions;
      two.plan(false); two.manual('confirmed_closed');
      expect(two.state('entry_door')).toBe('closed');
      expect(two.view().family.user_away).toBe(false);
      expect(three.state('entry_door')).toBe('unknown');
      two.userAway();
      expect(two.view().family.user_away).toBe(true);
      expect(one.view().task).toBeNull(); expect(three.view().task).toBeNull();
      two.execute('execution-first'); two.next(); two.next(); two.next();
      expect(two.state('living_room_light')).toBe('off');
      expect(one.state('living_room_light')).toBe('on'); expect(three.state('living_room_light')).toBe('on');
      three.plan(true);
      three.select('item_bedroom_ac', true);
      three.execute('object-first'); three.next(); three.next();
      expect(three.state('bedroom_ac')).toBe('off');
      expect(two.state('bedroom_ac')).toBe('on');
      two.reset();
      expect(two.view().task).toBeNull(); expect(two.state('entry_door')).toBe('unknown');
      expect(two.view().family.user_away).toBe(false); expect(two.state('living_room_light')).toBe('on');
      expect(three.state('bedroom_ac')).toBe('off');
      const notified = vi.fn(); three.subscribe(notified);
      three.reset(); three.plan(false); three.execute('execution-first');
      const frozen = three.view(); three.dispose(); notified.mockClear();
      three.next(); three.reset(); three.manual('confirmed_closed'); three.userAway();
      expect(three.pending()).toBe(0); expect(three.view()).toEqual(frozen); expect(notified).not.toHaveBeenCalled();
      expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
    } finally { sessions.forEach(session => session.dispose()); vi.unstubAllGlobals(); }
  });

  it('rejects foreign templates in constructor, responses and gateway envelopes before applying them', () => {
    const two = getSandboxTemplate('two_bedroom'), three = getSandboxTemplate('three_bedroom');
    const session = createSandboxSession(two);
    try {
      const snapshot = { template_id:two.templateId, demo_mode:true, objects:session.view().objects };
      const store = new ProductStore(two.map, snapshot);
      const before = store.view();
      expect(() => new ProductStore(three.map, snapshot)).toThrow('模板不匹配');
      expect(() => createSandboxSession({ templateId:three.templateId, map:two.map })).toThrow('映射不匹配');
      expect(() => store.applyResponse({ ...snapshot, template_id:three.templateId }, {kind:'snapshot'})).toThrow('模板不匹配');
      expect(() => store.applyResponse({ ...snapshot, demo_mode:false }, {kind:'snapshot'})).toThrow('demo_mode');
      expect(store.view()).toEqual(before);
      const gateway = new LocalGateway({ baseline_snapshot:snapshot }, store);
      expect(gateway.envelope({objects:{}}).body.template_id).toBe(two.templateId);
      expect(() => gateway.envelope({template_id:three.templateId})).toThrow('模板不匹配');
      expect(() => new LocalGateway({baseline_snapshot:{...snapshot,template_id:three.templateId}},store)).toThrow('模板不匹配');
      expect(store.view()).toEqual(before);
    } finally { session.dispose(); }
  });
});
