import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceCommit = '4bf23c8e8e92aeb1f588b59892c133fae6d82c31';
const names = {
  entryway: ['玄关', 'Entryway'], living_room: ['客厅', 'Living room'], dining_room: ['餐厅', 'Dining room'],
  bedroom: ['主卧', 'Main bedroom'], bedroom_guest: ['客卧', 'Guest bedroom'],
  bedroom_secondary: ['次卧', 'Second bedroom'], kitchen: ['厨房', 'Kitchen'],
  bathroom_shared: ['浴室', 'Bathroom'], hallway: ['走廊', 'Hallway'], balcony: ['生活阳台', 'Balcony'],
  entry_door: ['玄关普通门', 'Entry door'], balcony_door: ['阳台门磁', 'Balcony door sensor'],
  living_room_light: ['客厅灯', 'Living room light'], dining_room_light: ['餐区灯', 'Dining area light'],
  bedroom_ac: ['主卧空调', 'Main bedroom AC'], washing_machine: ['洗衣机', 'Washing machine'],
  kitchen_fridge: ['冰箱', 'Refrigerator'], living_room_tv: ['客厅电视', 'Living room TV'],
  living_room_curtain: ['客厅窗帘', 'Living room curtains'],
};

// Mobile viewing parameters are authored here, separately from extracted model
// identity. GLBs retain their delivered geometry and semantic node properties.
const cameraOffsets = {
  entry_door: [2.8, 3.8, 3.5], balcony_door: [3, 4, 3.4],
  living_room_light: [3, 4, 3.2], dining_room_light: [3.2, 4.4, 3.6],
  bedroom_ac: [2.8, 3.5, 3.5], washing_machine: [-3.7, 3.2, .4],
  kitchen_fridge: [2.8, 3.6, 3.5], living_room_tv: [-4, 3.3, .4],
  living_room_curtain: [3.2, 3.8, 3.5],
};

export function extractMobileMap(binary, model) {
  const hash = createHash('sha256').update(binary).digest('hex');
  if (hash !== model.glb_sha256) throw new Error(`GLB SHA-256 mismatch: ${model.template_id}`);
  if (binary.length < 20 || binary.toString('ascii', 0, 4) !== 'glTF'
    || binary.readUInt32LE(4) !== 2 || binary.readUInt32LE(8) !== binary.length
    || binary.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB header');
  const jsonLength = binary.readUInt32LE(12);
  if (jsonLength > binary.length - 20) throw new Error('Invalid GLB JSON length');
  const doc = JSON.parse(binary.toString('utf8', 20, 20 + jsonLength));
  const byName = new Map();
  doc.nodes.forEach((node, index) => {
    if (!node.name || byName.has(node.name)) throw new Error('Missing or repeated node name');
    byName.set(node.name, { node, index });
  });
  const root = byName.get('apartment_root');
  if (root?.node.extras?.template_id !== model.template_id) throw new Error('GLB template mismatch');
  const home = byName.get('home__focus');
  if (home?.node.extras?.owner_id !== 'home' || home.node.extras.role !== 'camera_target') throw new Error('Missing home camera target');
  if (doc.buffers.some(buffer => buffer.uri) || (doc.images ?? []).some(image => image.uri)) throw new Error('External resources are not supported in the offline model');
  const objects = doc.nodes.flatMap((node, index) => {
    if (!node.extras?.shared_id) return [];
    const { shared_id: id, room_id: roomId, object_type: type } = node.extras;
    const anchor = byName.get(`${id}__anchor`), focus = byName.get(`${id}__focus`);
    if (node.name !== id || !names[id] || !type || !roomId) throw new Error(`Incomplete object identity: ${id}`);
    if (anchor?.node.extras?.owner_id !== id || anchor.node.extras.role !== 'hotspot_anchor'
      || focus?.node.extras?.owner_id !== id || focus.node.extras.role !== 'camera_target') throw new Error(`Missing or incorrect target nodes: ${id}`);
    let [zh, en] = names[id];
    if (id === 'living_room' && model.template_id === 'generic_two_bedroom') [zh, en] = ['客餐厅', 'Living / dining room'];
    if (id === 'dining_room_light' && model.template_id === 'generic_three_bedroom') [zh, en] = ['餐厅灯', 'Dining room light'];
    return [{ shared_id: id, room_id: roomId, object_type: type, display_name: zh, display_name_en: en,
      spatial: true, node_name: node.name, node_index: index,
      anchor_name: anchor.node.name, anchor_node_index: anchor.index,
      focus_name: focus.node.name, focus_node_index: focus.index,
      camera_offset_gltf_m: type === 'room' ? [3.4, 6.2, 4.4] : cameraOffsets[id],
    }];
  });
  const rooms = objects.filter(object => object.object_type === 'room');
  const devices = objects.filter(object => object.object_type !== 'room');
  if (rooms.length !== model.room_regions || devices.length !== model.device_roots
    || new Set(objects.map(object => object.shared_id)).size !== objects.length) throw new Error('Unexpected model object counts');
  const roomIds = new Set(rooms.map(room => room.shared_id));
  if (objects.some(object => !roomIds.has(object.room_id) || !object.camera_offset_gltf_m)) throw new Error('Object room or camera mapping missing');
  return {
    schema_version: '0.1', status: 'extracted_from_glb_with_mobile_camera_parameters',
    template_id: model.template_id, asset: model.glb, sha256: hash, bytes: binary.length,
    source_commit: sourceCommit, unit: 'meter', coordinate_system: 'glTF +X east +Y up +Z south',
    mapping_provenance: 'Object IDs, room IDs, types and node indexes extracted from the delivered GLB. Display labels and mobile camera offsets added by the Homie adapter.',
    home_camera: { target_node: home.node.name, camera_offset_gltf_m: [8, 14.8, 10.8],
      vertical_fov_degrees: 34, polar_angle_limits_degrees: [20, 55], adaptive_fit: true },
    objects,
  };
}

export async function extractModelMaps({ check = false } = {}) {
  const catalog = JSON.parse(await readFile(resolve(projectRoot, 'models/catalog.json'), 'utf8'));
  for (const model of catalog.models) {
    const input = await readFile(resolve(projectRoot, 'models', model.glb));
    const output = JSON.stringify(extractMobileMap(input, model), null, 2) + '\n';
    const outputPath = resolve(projectRoot, 'models', model.directory, 'mobile-object-map.json');
    if (check) {
      if ((await readFile(outputPath, 'utf8')).replace(/\r\n/g, '\n') !== output) throw new Error(`Stale mobile map: ${model.template_id}`);
    } else await writeFile(outputPath, output, 'utf8');
    console.log(`${check ? 'Verified' : 'Wrote'} mobile map: ${model.template_id}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await extractModelMaps({ check: process.argv.includes('--check') });
}
