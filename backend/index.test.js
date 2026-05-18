import request from 'supertest';
import app from './index';
import pool from './db';
import { jest } from '@jest/globals';

describe('GET /api/health', () => {
  it('should return status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/db-test', () => {
  it('should return 200 and success message on successful query', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue([{ val: 1 }]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/db-test');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: { val: 1 } });
    expect(mockConn.release).toHaveBeenCalled();
    
    spy.mockRestore();
  });

  it('should return 500 and error message on failed connection', async () => {
    const spy = jest.spyOn(pool, 'getConnection').mockRejectedValue(new Error('Connection failed'));

    const res = await request(app).get('/api/db-test');
    expect(res.statusCode).toEqual(500);
    expect(res.body).toEqual({ status: 'error', message: 'Database connection failed' });
    
    spy.mockRestore();
  });
});
