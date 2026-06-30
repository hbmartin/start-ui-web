import { describe, expect, it } from 'vitest';

import {
  exceedsDeclaredBodyLimit,
  MAX_SERVER_FN_BODY_BYTES,
} from '@/platform/http/request-body-limit';

const requestWithContentLength = (value: string | null) =>
  new Request('https://app.example/_server', {
    method: 'POST',
    headers: value === null ? {} : { 'Content-Length': value },
  });

describe('exceedsDeclaredBodyLimit', () => {
  it('flags a declared Content-Length above the limit', () => {
    expect(
      exceedsDeclaredBodyLimit(
        requestWithContentLength(String(MAX_SERVER_FN_BODY_BYTES + 1))
      )
    ).toBe(true);
  });

  it('allows a declared Content-Length at or below the limit', () => {
    expect(
      exceedsDeclaredBodyLimit(
        requestWithContentLength(String(MAX_SERVER_FN_BODY_BYTES))
      )
    ).toBe(false);
    expect(exceedsDeclaredBodyLimit(requestWithContentLength('10'))).toBe(
      false
    );
  });

  it('does not flag a missing or unparseable Content-Length (advisory only)', () => {
    expect(exceedsDeclaredBodyLimit(requestWithContentLength(null))).toBe(
      false
    );
    expect(
      exceedsDeclaredBodyLimit(requestWithContentLength('not-a-number'))
    ).toBe(false);
  });

  it('honours an explicit lower bound', () => {
    expect(exceedsDeclaredBodyLimit(requestWithContentLength('100'), 50)).toBe(
      true
    );
  });
});
