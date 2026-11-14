"""Validate the downloadable model handoff with Python's standard library."""
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parent


def resolve_file(relative):
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError(f'Missing or invalid model path: {relative}')
    return path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


catalog = json.loads((ROOT / 'catalog.json').read_text(encoding='utf-8'))
assert catalog['schema_version'] == 1
assert len({m['template_id'] for m in catalog['models']}) == len(catalog['models']) == 2
for model in catalog['models']:
    asset = resolve_file(model['glb'])
    assert asset.name == model['display_name'] + '.glb', 'Display name / filename mismatch'
    assert digest(asset) == model['glb_sha256'], f'GLB hash mismatch: {asset.name}'
    checksum_file = resolve_file(model['checksums'])
    checked = 0
    for line in checksum_file.read_text(encoding='utf-8').splitlines():
        expected, filename = line.split('  ', 1)
        path = resolve_file(model['directory'] + '/' + filename)
        assert digest(path) == expected, f'Checksum mismatch: {path.name}'
        checked += 1
    assert checked == 7, 'Expected model, Blender file, two renders and three QA reports'
    for field in ['blend', 'overview', 'plan']:
        path = resolve_file(model[field])
        signature = path.read_bytes()[:8]
        assert signature.startswith(b'BLENDER' if field == 'blend' else b'\x89PNG\r\n\x1a\n')

    raw = asset.read_bytes()
    assert struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)), 'Invalid GLB header'
    length, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(raw[20:20 + length])
    roots = [node['extras'] for node in doc['nodes'] if 'shared_id' in node.get('extras', {})]
    rooms = [r for r in roots if r['object_type'] == 'room']
    devices = [r for r in roots if r['object_type'] != 'room']
    assert len(rooms) == model['room_regions']
    assert len(devices) == model['device_roots']
    assert sum(r['shared_id'].startswith('bedroom') for r in rooms) == model['bedrooms']
    assert sum(r['shared_id'] in ['living_room', 'dining_room'] for r in rooms) == model['halls']
    apartment = next(n for n in doc['nodes'] if n['name'] == 'apartment_root')
    assert apartment['extras']['template_id'] == model['template_id']
    assert all('uri' not in buffer for buffer in doc['buffers'])
    assert len(doc.get('images', [])) >= 2
    assert all('uri' not in image and 'bufferView' in image for image in doc['images'])
    assert not doc.get('animations') and not doc.get('cameras')
    for filename in ['layout-validation.json', 'furniture-geometry.json', 'model-validation.json']:
        report = json.loads(resolve_file(model['directory'] + '/qa/' + filename).read_text(encoding='utf-8'))
        assert report['status'] == 'passed'
        if filename == 'model-validation.json':
            assert report['asset_filename'] == asset.name
            assert report['glb_sha256'] == model['glb_sha256']
    print(f"PASS {model['template_id']}: {len(rooms)} rooms, {len(devices)} devices, {checked} verified files")
