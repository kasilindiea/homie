import { describe, expect, it, vi } from 'vitest';
import { createSandboxSession } from '../src/features/sandbox-runtime/session.js';

describe('offline sandbox lifetime', () => {
  it('keeps accepted commands separate from valid readings and never touches household storage', () => {
    const storage = { getItem: vi.fn(() => { throw new Error('No storage allowed'); }), setItem: vi.fn(() => { throw new Error('No storage allowed'); }) };
    vi.stubGlobal('localStorage', storage);
    const session = createSandboxSession();
    try {
      session.plan(false);
      expect(session.state('living_room_light')).toBe('on');
      session.execute('execution-first');
      expect(session.state('living_room_light')).toBe('on');
      session.next();
      expect(session.results()[0].status).toBe('confirmed');
      expect(session.state('living_room_light')).toBe('on');
      session.next();
      expect(session.state('living_room_light')).toBe('unknown');
      session.next();
      expect(session.state('living_room_light')).toBe('off');
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
    } finally { session.dispose(); vi.unstubAllGlobals(); }
  });

  it('discards queued readings and listeners on unmount and starts a fresh independent demo', () => {
    const session = createSandboxSession();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    session.plan(false);
    session.execute('object-first');
    expect(session.pending()).toBe(2);
    const before = session.view();
    session.dispose();
    listener.mockClear();
    session.next(); session.reset(); session.manual('confirmed_closed'); session.userAway();
    expect(session.pending()).toBe(0);
    expect(session.view()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe(); session.dispose();
    const next = createSandboxSession();
    expect(next.view().task).toBeNull();
    expect(next.state('living_room_light')).toBe('on');
    expect(next.pending()).toBe(0);
    next.dispose();
  });
});
