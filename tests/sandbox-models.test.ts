import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalog from '../models/catalog.json';
import { extractMobileMap } from '../scripts/extract-model-maps.mjs';
import { SANDBOX_TEMPLATES, getSandboxTemplate, templateObjectName } from '../src/features/sandbox-runtime/templates';
import { FURNITURE_TYPES } from '../src/domain';

describe('delivered model mapping integrity', () => {
  for (const metadata of catalog.models) {
    it(`maps the actual ${metadata.template_id} asset without borrowing other template nodes`, () => {
      const binary = readFileSync(resolve('models', metadata.glb));
      const document = JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString('utf8'));
      const map = JSON.parse(readFileSync(resolve('models', metadata.directory, 'mobile-object-map.json'), 'utf8'));
      const root = document.nodes.find((node: any) => node.name === 'apartment_root');
      expect(map.template_id).toBe(root.extras.template_id);
      expect(map.sha256).toBe(createHash('sha256').update(binary).digest('hex'));
      expect(map.sha256).toBe(metadata.glb_sha256);
      expect(map.source_commit).toBe('4bf23c8e8e92aeb1f588b59892c133fae6d82c31');
      expect(map.home_camera.target_node).toBe('home__focus');
      expect(document.nodes.some((node: any) => node.name === map.home_camera.target_node)).toBe(true);
      const roots = document.nodes.filter((node: any) => node.extras?.shared_id);
      expect(new Set(map.objects.map((object: any) => object.shared_id))).toEqual(new Set(roots.map((node: any) => node.extras.shared_id)));
      for (const object of map.objects) {
        const actual = document.nodes[object.node_index];
        expect(actual.name).toBe(object.node_name);
        expect(actual.extras).toMatchObject({ shared_id:object.shared_id, room_id:object.room_id, object_type:object.object_type });
        expect(document.nodes[object.anchor_node_index]).toMatchObject({ name:object.anchor_name, extras:{owner_id:object.shared_id, role:'hotspot_anchor'} });
        expect(document.nodes[object.focus_node_index]).toMatchObject({ name:object.focus_name, extras:{owner_id:object.shared_id, role:'camera_target'} });
        expect(object.camera_offset_gltf_m).toHaveLength(3);
        expect(object.camera_offset_gltf_m.every(Number.isFinite)).toBe(true);
      }
      expect(map.objects.filter((object: any) => object.object_type === 'room')).toHaveLength(metadata.room_regions);
      expect(map.objects.filter((object: any) => object.object_type !== 'room')).toHaveLength(9);
      expect(map.objects.some((object: any) => ['study', 'home_battery', 'laundry_balcony'].includes(object.shared_id))).toBe(false);
      expect(extractMobileMap(binary, metadata)).toEqual(map);
      expect(() => extractMobileMap(binary, { ...metadata, template_id:'different_apartment' })).toThrow('template mismatch');
      const changed = Buffer.from(binary); changed[changed.length - 1] ^= 1;
      expect(() => extractMobileMap(changed, metadata)).toThrow('SHA-256 mismatch');
    });
  }

  it('keeps three distinct templates, localizable room identity and compatible furniture categories', () => {
    expect(SANDBOX_TEMPLATES.map(entry => entry.layoutId)).toEqual(['one_bedroom', 'two_bedroom', 'three_bedroom']);
    expect(new Set(SANDBOX_TEMPLATES.map(entry => entry.modelUrl)).size).toBe(3);
    expect(getSandboxTemplate('unknown').templateId).toBe('baseline_apartment');
    for (const template of SANDBOX_TEMPLATES) {
      const allIds = template.map.objects.map(object => object.shared_id);
      for (const [id, type] of Object.entries(template.bindableObjects)) {
        expect(allIds).toContain(id);
        expect(FURNITURE_TYPES.some(item => item.value === type)).toBe(true);
      }
      expect(template.bindableObjects).not.toHaveProperty('entry_door');
      expect(templateObjectName(template, 'not-in-this-template', 'en')).toBe('not-in-this-template');
    }
    const two = getSandboxTemplate('two_bedroom'), three = getSandboxTemplate('three_bedroom');
    expect(two.rooms.some(room => room.shared_id === 'dining_room')).toBe(false);
    expect(three.rooms.some(room => room.shared_id === 'dining_room')).toBe(true);
    expect(templateObjectName(two, 'living_room', 'zh-CN')).toBe('客餐厅');
    expect(templateObjectName(three, 'living_room', 'en')).toBe('Living room');
    expect(templateObjectName(getSandboxTemplate('one_bedroom'), 'home_battery', 'zh')).toBe('家庭储能');
  });
});
