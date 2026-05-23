import {
  type QueryClient,
  QueryClientProvider as Provider,
} from '@tanstack/react-query';
import { ReactNode } from 'react';

export const QueryClientProvider = (props: {
  client: QueryClient;
  children?: ReactNode;
}) => {
  return <Provider client={props.client}>{props.children}</Provider>;
};
