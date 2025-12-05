import request from 'supertest';
import { app } from '../server.mjs';

describe('Application Core Smoke Tests', () => {

  // Test the public login route (should return HTML and status 200)
  it('GET /login should return 200 and the login page', async () => {
    const res = await request(app).get('/login');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('<!doctype html>'); 
  });

  // Test the fallback 404 handler
  it('GET /random-route should return 404 Not Found', async () => {
    const res = await request(app).get('/api/v1/a-route-that-does-not-exist');
    expect(res.statusCode).toBe(404);
  });
});