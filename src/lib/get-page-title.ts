import { getEnvHintTitlePrefix } from '@/modules/devtools/presentation';

export const getPageTitle = (pageTitle?: string) =>
  pageTitle
    ? `${getEnvHintTitlePrefix()} ${pageTitle} | Start UI`
    : `${getEnvHintTitlePrefix()} Start UI`;
