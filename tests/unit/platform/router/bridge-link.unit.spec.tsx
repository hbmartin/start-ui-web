import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LinkMockProps = Record<string, unknown> & {
  children?:
    | ReactNode
    | ((state: { isActive: boolean; isTransitioning: boolean }) => ReactNode);
};

const linkMocks = vi.hoisted(() => ({
  props: [] as LinkMockProps[],
}));

vi.mock('@tanstack/react-router', () => ({
  Link: (props: LinkMockProps) => {
    linkMocks.props.push(props);
    return typeof props.children === 'function'
      ? props.children({ isActive: true, isTransitioning: false })
      : (props.children ?? null);
  },
}));

import { BridgeLink } from '@/platform/router';

describe('BridgeLink', () => {
  beforeEach(() => {
    linkMocks.props = [];
  });

  it('passes ordinary routes through to TanStack Link', () => {
    const markup = renderToStaticMarkup(
      <BridgeLink to="/login" preload="intent" data-testid="login-link">
        Login
      </BridgeLink>
    );

    expect(markup).toBe('Login');
    expect(linkMocks.props).toHaveLength(1);
    expect(linkMocks.props[0]).toMatchObject({
      'data-testid': 'login-link',
      preload: 'intent',
      to: '/login',
    });
  });

  it('supports TanStack Link render-prop children', () => {
    const markup = renderToStaticMarkup(
      <BridgeLink to="/manager">
        {({ isActive }) => createElement('span', null, isActive.toString())}
      </BridgeLink>
    );

    expect(markup).toBe('<span>true</span>');
  });

  it('throws for protected side-effect routes in test mode', () => {
    expect(() =>
      renderToStaticMarkup(<BridgeLink to="/logout">Logout</BridgeLink>)
    ).toThrow(
      'BridgeLink cannot navigate declaratively to protected side-effect route "/logout". Use an explicit command flow such as ConfirmSignOut instead.'
    );
    expect(linkMocks.props).toEqual([]);
  });

  it('does not allow explicit preloading to bypass a protected route block', () => {
    expect(() =>
      renderToStaticMarkup(
        <BridgeLink to="/logout" preload="intent">
          Logout
        </BridgeLink>
      )
    ).toThrow(/ConfirmSignOut/);
    expect(linkMocks.props).toEqual([]);
  });
});
