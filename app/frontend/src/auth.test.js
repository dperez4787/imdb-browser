/**
 * IMDB-2: the auth.js boundary in isolation. The Firebase SDK modules are
 * mocked at their package seam — no test ever touches real Firebase — so these
 * tests pin the boundary's contract: lazy one-time init, Google-popup-only
 * sign-in, and a null ID token when signed out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const authInstance = { currentUser: null };
  return {
    authInstance,
    getApps: vi.fn(() => []),
    getApp: vi.fn(() => ({ name: 'existing-app' })),
    initializeApp: vi.fn(() => ({ name: 'new-app' })),
    getAuth: vi.fn(() => authInstance),
    onAuthStateChanged: vi.fn(() => () => {}),
    signInWithPopup: vi.fn(async () => ({ user: { uid: 'u1' } })),
    signOut: vi.fn(async () => {}),
    GoogleAuthProvider: class GoogleAuthProvider {},
  };
});

vi.mock('firebase/app', () => ({
  getApps: fake.getApps,
  getApp: fake.getApp,
  initializeApp: fake.initializeApp,
}));

vi.mock('firebase/auth', () => ({
  getAuth: fake.getAuth,
  onAuthStateChanged: fake.onAuthStateChanged,
  signInWithPopup: fake.signInWithPopup,
  signOut: fake.signOut,
  GoogleAuthProvider: fake.GoogleAuthProvider,
}));

/** Re-import auth.js fresh so its lazy cache resets between tests. */
async function freshAuthModule() {
  vi.resetModules();
  return import('./auth.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.authInstance.currentUser = null;
  fake.getApps.mockReturnValue([]);
});

describe('auth.js boundary', () => {
  it('has no side effects on import — the SDK initializes only on first use', async () => {
    await freshAuthModule();
    expect(fake.initializeApp).not.toHaveBeenCalled();
    expect(fake.getAuth).not.toHaveBeenCalled();
  });

  it('initializes once, with the committed public config, and caches the instance', async () => {
    const { subscribeToAuth } = await freshAuthModule();
    const unsubscribe = () => {};
    fake.onAuthStateChanged.mockReturnValue(unsubscribe);

    const listener = () => {};
    expect(subscribeToAuth(listener)).toBe(unsubscribe);
    expect(fake.initializeApp).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        projectId: 'project-d60a83c1-2c60-4d51-ad0',
        appId: expect.stringMatching(/^1:756865700041:web:/),
      }),
    );
    expect(fake.onAuthStateChanged).toHaveBeenCalledWith(fake.authInstance, listener);

    subscribeToAuth(listener);
    expect(fake.initializeApp).toHaveBeenCalledTimes(1);
    expect(fake.getAuth).toHaveBeenCalledTimes(1);
  });

  it('reuses an already-created app (HMR / re-import safety)', async () => {
    const { subscribeToAuth } = await freshAuthModule();
    fake.getApps.mockReturnValue([{ name: 'existing-app' }]);

    subscribeToAuth(() => {});
    expect(fake.getApp).toHaveBeenCalledTimes(1);
    expect(fake.initializeApp).not.toHaveBeenCalled();
  });

  it('signs in via a Google popup — the only sign-in path', async () => {
    const { signInWithGoogle } = await freshAuthModule();
    const result = { user: { uid: 'u1' } };
    fake.signInWithPopup.mockResolvedValue(result);

    await expect(signInWithGoogle()).resolves.toBe(result);
    expect(fake.signInWithPopup).toHaveBeenCalledExactlyOnceWith(
      fake.authInstance,
      expect.any(fake.GoogleAuthProvider),
    );
  });

  it('signs out through the SDK', async () => {
    const { signOutUser } = await freshAuthModule();
    await signOutUser();
    expect(fake.signOut).toHaveBeenCalledExactlyOnceWith(fake.authInstance);
  });

  it('getIdToken returns null when nobody is signed in', async () => {
    const { getIdToken } = await freshAuthModule();
    await expect(getIdToken()).resolves.toBeNull();
  });

  it('getIdToken returns the current user’s (auto-refreshing) token', async () => {
    const { getIdToken } = await freshAuthModule();
    fake.authInstance.currentUser = {
      getIdToken: vi.fn(async () => 'id-token-123'),
    };

    await expect(getIdToken()).resolves.toBe('id-token-123');
    expect(fake.authInstance.currentUser.getIdToken).toHaveBeenCalledTimes(1);
  });
});
