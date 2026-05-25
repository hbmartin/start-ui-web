import type { Auth } from '@/composition/auth';
import { auth, getAuthUseCases } from '@/composition/auth';

import { createServerContextTools } from './transport/tanstack/server-context';

export type { AuthenticatedSession, AuthenticatedUser } from './domain/session';
export {
  scopeFromUser,
  scopeKeyFromScope,
  scopeKeyFromSession,
  type CurrentSession,
  type RequestScope,
} from './domain/request-scope';
export {
  createServerContextTools,
  type ProcedureLogger,
  type ProtectedContext,
  type PublicContext,
  setPublicResponseCacheHeaders,
} from './transport/tanstack/server-context';

const serverContextTools = createServerContextTools({ getAuthUseCases });

export { auth, getAuthUseCases };
export type { Auth };
export { authServerFunctions, currentSession } from './server-functions';
export const assertPermission = serverContextTools.assertPermission;
export const withProtectedContext = serverContextTools.withProtectedContext;
export const withProtectedMutation = serverContextTools.withProtectedMutation;
export const withPublicContext = serverContextTools.withPublicContext;
