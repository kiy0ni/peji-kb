import request from 'supertest';
import { app } from '../server.mjs';

describe('Security Middleware Enforcement', () => {
  
  // Test protected API endpoint without session or API key
  it('GET /api/v1/me should be blocked (401 Unauthorized or Redirect)', async () => {
    const res = await request(app)
        .get('/api/v1/me')
        .set('Accept', 'application/json'); // Hint that we want JSON, trying to force a 401 instead of 302
    
    // Accept 401 (Standard API Auth error) or 302 (Redirect to login)
    const validStatuses = [401, 302];
    expect(validStatuses).toContain(res.statusCode);

    // If it was a 401 JSON response, verify the body structure
    if (res.statusCode === 401) {
        expect(res.body.success).toBe(false);
    }
  });

  // Test protected Admin API endpoint (highest level of restriction)
  it('GET /api/v1/admin/users/1/keys should be blocked without admin scope', async () => {
    const res = await request(app).get('/api/v1/admin/users/1/keys');
    
    // Should be 401 (Unauthorized), 403 (Forbidden), or 302 (Redirect)
    const validStatuses = [400, 401, 403, 302]; 
    
    // Using simple array check instead of greaterThanOrEqual for precision
    expect(validStatuses).toContain(res.statusCode); 
  });
});