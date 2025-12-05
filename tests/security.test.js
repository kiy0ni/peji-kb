import request from 'supertest';
import { app } from '../server.mjs';

describe('Security Middleware Enforcement', () => {
  
  // Test protected API endpoint without session or API key
  it('GET /api/v1/me should be blocked (401 Unauthorized)', async () => {
    const res = await request(app).get('/api/v1/me');
    
    // The hybrid authentication middleware must return 401
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // Test protected Admin API endpoint (highest level of restriction)
  it('GET /api/v1/admin/users/1/keys should be blocked without admin scope', async () => {
    const res = await request(app).get('/api/v1/admin/users/1/keys');
    
    // Should be 401 (Unauthorized) or 403 (Forbidden)
    expect(res.statusCode).toBeGreaterThanOrEqual(400); 
  });
});