import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

/* Interface na Vercel, API em outro servidor: só as origens configuradas passam. */

describe('CORS', () => {
  it('libera a origem configurada, inclusive o preflight', async () => {
    const t = await createTestApp({ CORS_ORIGINS: 'https://calendarios.vercel.app/' });
    const pre = await t.app.inject({ method: 'OPTIONS', url: '/api/auth/login', headers: { origin: 'https://calendarios.vercel.app', 'access-control-request-method': 'POST' } });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('https://calendarios.vercel.app');
    expect(pre.headers['access-control-allow-headers']).toContain('authorization');
    const res = await t.app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://calendarios.vercel.app' } });
    expect(res.headers['access-control-allow-origin']).toBe('https://calendarios.vercel.app');
  });

  it('não libera origens desconhecidas', async () => {
    const t = await createTestApp({ CORS_ORIGINS: 'https://calendarios.vercel.app' });
    const res = await t.app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://site-estranho.com' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
