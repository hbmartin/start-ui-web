import { Link, type LinkProps } from '@tanstack/react-router';
import * as React from 'react';

import { isProtectedNavigationPath } from './navigation-safety';

export type BridgeLinkProps = LinkProps;

const protectedNavigationErrorMessage = (target: string) =>
  `BridgeLink cannot navigate declaratively to protected side-effect route "${target}". Use an explicit command flow such as ConfirmSignOut instead.`;

const isProductionBuild = () =>
  Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);

const protectedNavigationTarget = (to: unknown) =>
  typeof to === 'string' && isProtectedNavigationPath(to) ? to : undefined;

const BridgeLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  BridgeLinkProps
>((props, ref) => {
  const protectedTarget = protectedNavigationTarget(props.to);

  if (!protectedTarget) {
    return <Link {...props} ref={ref} />;
  }

  const guardedProps = {
    ...props,
    disabled: true,
    preload: false as const,
  };

  if (!isProductionBuild()) {
    throw new Error(protectedNavigationErrorMessage(protectedTarget));
  }

  return <Link {...guardedProps} ref={ref} />;
});

BridgeLinkComponent.displayName = 'BridgeLink';

export const BridgeLink = BridgeLinkComponent as typeof Link;
