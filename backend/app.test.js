import request from 'supertest';
import { createApp } from './app.js';
import pool from './db.js';

afterAll(async () => {
  await pool.end();
});

describe('backend app assembly', () => {
  it('serves health checks without starting a listener', async () => {
    const app = createApp();

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
