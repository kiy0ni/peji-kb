import request from 'supertest';
import { app } from '../server.mjs';

describe('Application Core Smoke Tests', () => {
  // Test the public login route (should return HTML and status 200)
  it('GET /login should return 200 and the login page', async () => {
    const res = await request(app).get('/login');
    expect(res.statusCode).toBe(200);
    // Check for a functional element instead of strict Doctype to avoid whitespace issues
    expect(res.text).toContain('action="/login"');
  });

  // Test the fallback 404 handler
  it('GET /random-route should handle non-existent routes (404 or Redirect)', async () => {
    const res = await request(app).get('/api/v1/a-route-that-does-not-exist');

    // Depending on auth middleware order, this might 404 or redirect (302) to login
    const validStatuses = [404, 302];
    expect(validStatuses).toContain(res.statusCode);
  });
});
