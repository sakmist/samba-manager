import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/index';
import { setCredentials } from '../src/server/config';

const app = createApp();

beforeAll(() => {
  setCredentials('admin', 'correct-horse');
});

describe('http surface', () => {
  it('reports health without authentication', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('guards the management API', async () => {
    const response = await request(app).get('/api/status');
    expect(response.status).toBe(401);
  });

  it('rejects bad credentials', async () => {
    const response = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(response.status).toBe(401);
  });

  it('logs in and then reaches a guarded route', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correct-horse' });
    expect(login.status).toBe(200);

    const cookies = login.headers['set-cookie'];
    expect(cookies).toBeDefined();

    const me = await request(app).get('/api/auth/me').set('Cookie', cookies as unknown as string[]);
    expect(me.body.authenticated).toBe(true);
    expect(me.body.username).toBe('admin');
  });

  it('validates the login payload', async () => {
    const response = await request(app).post('/api/auth/login').send({ username: 'admin' });
    expect(response.status).toBe(400);
  });
});
