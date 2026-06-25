import { describe, expect, it } from 'vitest';

import { getClientIp } from '@/platform/http/get-client-ip';

const requestWith = (headers: Record<string, string>) =>
  new Request('http://localhost/api/telemetry/logs', { headers });

describe('getClientIp', () => {
  it('prefers CF-Connecting-IP', () => {
    const ip = getClientIp(
      requestWith({
        'CF-Connecting-IP': '203.0.113.7',
        'X-Forwarded-For': '198.51.100.1',
        'X-Real-IP': '192.0.2.1',
      })
    );
    expect(ip).toBe('203.0.113.7');
  });

  it('falls back to the first X-Forwarded-For hop', () => {
    const ip = getClientIp(
      requestWith({ 'X-Forwarded-For': '198.51.100.1, 10.0.0.1' })
    );
    expect(ip).toBe('198.51.100.1');
  });

  it('falls back to X-Real-IP', () => {
    const ip = getClientIp(requestWith({ 'X-Real-IP': '192.0.2.1' }));
    expect(ip).toBe('192.0.2.1');
  });

  it('returns undefined when no proxy headers are present', () => {
    expect(getClientIp(requestWith({}))).toBeUndefined();
  });

  it('ignores blank header values', () => {
    expect(
      getClientIp(requestWith({ 'X-Forwarded-For': '   ' }))
    ).toBeUndefined();
  });
});
