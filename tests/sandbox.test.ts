import { describe, expect, it } from 'vitest';
import { getDemoReading } from '../src/features/sandbox-demo';
import { mountSandboxScene, renderSandboxScene } from '../src/features/sandbox-scene';

describe('sandbox presentation boundaries', () => {
  it('keeps charging, generation and consumption distinct and explicitly synthetic', () => {
    expect(getDemoReading('light')).toMatchObject({ source: 'demo', mode: 'consumption' });
    expect(getDemoReading('home_battery')).toMatchObject({ source: 'demo', mode: 'charge' });
    expect(getDemoReading('solar_panel')).toMatchObject({ source: 'demo', mode: 'generation' });
  });

  it('does not turn missing or non-electrical readings into zero power or an off state', () => {
    for (const type of ['sofa', 'table', 'other', 'unrecognized', '__proto__']) {
      expect(getDemoReading(type)).toMatchObject({ mode: 'not-applicable', energyKwh: null, powerW: null, isOn: null });
    }
    expect(getDemoReading('sensor')).toMatchObject({ energyKwh: null, powerW: null });
  });

  it('provides a placeholder, loading state and a retryable failure state', () => {
    expect(renderSandboxScene()).toContain('<svg');
    expect(renderSandboxScene('loading')).toContain('role="status"');
    expect(renderSandboxScene('loading')).toContain('正在加载场景');
    expect(renderSandboxScene('error')).toContain('场景未能加载');
    expect(renderSandboxScene('error')).toContain('data-sandbox-action="retry-scene"');
  });

  it('stops late scene updates after the mount is disposed', () => {
    const attributes: Record<string, string> = {};
    const container = {
      dataset: {} as Record<string, string>,
      innerHTML: '',
      setAttribute: (name: string, value: string) => { attributes[name] = value; },
      replaceChildren() { this.innerHTML = ''; },
    };
    const scene = mountSandboxScene(container as unknown as HTMLElement);
    expect(container.dataset.sceneState).toBe('placeholder');
    scene.show('loading');
    expect(attributes['aria-busy']).toBe('true');
    scene.show('error');
    expect(attributes['aria-busy']).toBe('false');
    scene.dispose();
    scene.show('loading');
    expect(container.innerHTML).toBe('');
    expect(container.dataset.sceneState).toBe('error');
    expect(attributes['aria-busy']).toBe('false');
  });
});
