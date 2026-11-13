'use strict';

const { expect } = require('chai');
const {
  BACKEND_HEALTH_URL,
  BACKEND_SERVICE,
  SC_EXE,
  createProcessAdapter,
  processOneJob,
} = require('../../scripts/settings-apply-worker');

describe('Fixed settings apply worker lifecycle', () => {
  const makeStore = job => {
    const calls = [];
    return {
      calls,
      claimApplyJob: async () => job,
      normalizeSettings: settings => {
        if (settings.EMAIL_PORT && (!/^(0|[1-9][0-9]*)$/.test(settings.EMAIL_PORT) || Number(settings.EMAIL_PORT) > 65535)) throw new Error('invalid settings');
        return settings;
      },
      activateClaimedJob: async id => { calls.push(['activate', id]); },
      beginApplyRollback: async id => { calls.push(['rollback', id]); },
      completeApplyJob: async (id, result) => { calls.push(['complete', id, result]); },
    };
  };

  it('uses only the compiled-in backend service and loopback health URL', () => {
    expect(BACKEND_SERVICE).to.equal('LaptopStoreBackend');
    expect(BACKEND_HEALTH_URL).to.equal('http://127.0.0.1:5000/readyz');
  });

  it('activates, restarts, verifies version, and only then marks success', async () => {
    const store = makeStore({ id: 'job-1', version: 7, settings: { EMAIL_PORT: '587' }, previousActive: null });
    const events = [];
    const adapter = {
      restartBackend: async () => events.push('restart'),
      waitForHealthyVersion: async version => events.push(`healthy:${version}`),
    };

    expect(await processOneJob({ store, adapter })).to.equal(true);
    expect(events).to.deep.equal(['restart', 'healthy:7']);
    expect(store.calls).to.deep.equal([
      ['activate', 'job-1'],
      ['complete', 'job-1', { succeeded: true, message: 'Settings activated and backend health/version check succeeded.' }],
    ]);
  });

  it('restores previous state and restarts fixed backend after a failed health/version check', async () => {
    const store = makeStore({
      id: 'job-2', version: 8, settings: { EMAIL_PORT: '587' },
      previousActive: { version: 7, settings: { EMAIL_PORT: '465' } },
    });
    const events = [];
    let checks = 0;
    const adapter = {
      restartBackend: async () => events.push('restart'),
      waitForHealthyVersion: async version => {
        events.push(`healthy:${version}`);
        checks += 1;
        if (checks === 1) throw new Error('wrong active version');
      },
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(await processOneJob({ store, adapter })).to.equal(true);
    } finally {
      console.error = originalError;
    }
    expect(events).to.deep.equal(['restart', 'healthy:8', 'restart', 'healthy:7']);
    expect(store.calls.map(call => call[0])).to.deep.equal(['activate', 'rollback', 'complete']);
    expect(store.calls[2]).to.deep.equal(['complete', 'job-2', {
      succeeded: false,
      rollbackVerified: true,
      message: 'Apply failed; the previous settings version was restored and verified.',
    }]);
  });

  it('rejects invalid settings before activation and does not restart the backend', async () => {
    const store = makeStore({ id: 'job-3', version: 9, settings: { EMAIL_PORT: '70000' }, previousActive: null });
    let restarts = 0;
    const originalError = console.error;
    console.error = () => {};
    try {
      await processOneJob({ store, adapter: { restartBackend: async () => { restarts += 1; } } });
    } finally {
      console.error = originalError;
    }
    expect(restarts).to.equal(0);
    expect(store.calls.map(call => call[0])).to.deep.equal(['complete']);
    expect(store.calls[0][2].succeeded).to.equal(false);
  });

  it('resumes an interrupted rollback without reactivating failed settings', async () => {
    const store = makeStore({
      id: 'job-resume', status: 'rolling-back', version: 9,
      settings: { EMAIL_PORT: '587' }, previousActive: { version: 7, settings: { EMAIL_PORT: '465' } },
    });
    const events = [];
    await processOneJob({
      store,
      adapter: {
        restartBackend: async () => events.push('restart'),
        waitForHealthyVersion: async version => events.push(`healthy:${version}`),
      },
    });
    expect(events).to.deep.equal(['restart', 'healthy:7']);
    expect(store.calls.map(call => call[0])).to.deep.equal(['complete']);
    expect(store.calls[0][2]).to.include({ succeeded: false, rollbackVerified: true });
  });

  it('reports operator review when rollback health cannot be verified', async () => {
    const store = makeStore({ id: 'job-rollback', version: 9, settings: { EMAIL_PORT: '587' }, previousActive: { version: 7, settings: { EMAIL_PORT: '465' } } });
    const originalError = console.error;
    console.error = () => {};
    try {
      await processOneJob({
        store,
        adapter: {
          restartBackend: async () => {},
          waitForHealthyVersion: async () => { throw new Error('health check failed'); },
        },
      });
    } finally {
      console.error = originalError;
    }
    expect(store.calls.at(-1)).to.deep.equal(['complete', 'job-rollback', {
      succeeded: false,
      rollbackVerified: false,
      message: 'Apply failed and rollback could not be verified; operator review is required.',
    }]);
  });

  it('builds service control calls only from the fixed backend service name', async () => {
    const calls = [];
    let state = 4;
    const adapter = createProcessAdapter({
      exec: async (file, args) => {
        calls.push([file, args]);
        if (args[0] === 'query') return { stdout: `STATE : ${state}`, stderr: '' };
        if (args[0] === 'stop') state = 1;
        if (args[0] === 'start') state = 4;
        return { stdout: '', stderr: '' };
      },
      clock: () => 1,
    });
    await adapter.restartBackend();
    expect(calls).to.deep.equal([
      [SC_EXE, ['query', 'LaptopStoreBackend']],
      [SC_EXE, ['stop', 'LaptopStoreBackend']],
      [SC_EXE, ['query', 'LaptopStoreBackend']],
      [SC_EXE, ['start', 'LaptopStoreBackend']],
      [SC_EXE, ['query', 'LaptopStoreBackend']],
    ]);
  });
});
