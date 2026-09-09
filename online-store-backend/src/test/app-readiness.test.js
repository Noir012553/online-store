const { expect } = require('chai');
const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../app');

describe('Application readiness', () => {
  it('reports not ready while startup initialization is incomplete', async () => {
    const response = await request(app).get('/readyz');

    expect(response.status).to.equal(503);
    expect(response.body).to.include({ status: 'not_ready', startupReady: false });
    expect(response.body.storage.required).to.equal(false);
    expect(response.body.storage.configured).to.equal(true);
  });

  it('keeps the root endpoint available as a liveness check', async () => {
    const response = await request(app).get('/');

    expect(response.status).to.equal(200);
    expect(response.body.database.connected).to.equal(mongoose.connection.readyState === 1);
  });

  it('exposes export metrics without requiring database readiness', async () => {
    const response = await request(app).get('/api/health/exports');
    const prometheus = await request(app).get('/api/health/exports/prometheus');

    expect(response.status).to.equal(200);
    expect(response.body.service).to.equal('exports');
    expect(response.body.counters).to.have.property('enqueued');
    expect(prometheus.status).to.equal(200);
    expect(prometheus.text).to.include('export_jobs_total');
  });
});
