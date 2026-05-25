import type { AnyFormApi } from '@tanstack/react-form';
import type { ComponentType, PropsWithChildren } from 'react';

import { getAppFormSubmitValues } from '@/platform/components/form/app-form-context';
import { cn } from '@/platform/lib/tailwind/utils';

type AppFormApi = AnyFormApi & {
  AppForm?: ComponentType<PropsWithChildren>;
};

type FormProps = PropsWithChildren<
  {
    form?: AppFormApi;
    noHtmlForm?: boolean;
    className?: string;
    onSubmit?: (values: ExplicitAny) => void | Promise<void>;
  } & Record<string, ExplicitAny>
>;

export const Form = ({
  form: explicitForm,
  noHtmlForm = false,
  className,
  onSubmit,
  ...props
}: FormProps) => {
  const form = explicitForm ?? (props as unknown as AppFormApi);
  const htmlProps = explicitForm ? props : {};
  const Provider =
    form.AppForm ?? (({ children }: PropsWithChildren) => children);

  if (noHtmlForm) {
    return <Provider>{props.children}</Provider>;
  }

  return (
    <Provider>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void (async () => {
            await form.handleSubmit();
            if (onSubmit && form.state.isValid) {
              await onSubmit(getAppFormSubmitValues(form, form.state.values));
            }
          })();
        }}
        className={cn('flex flex-1 flex-col', className)}
        {...htmlProps}
      >
        {props.children}
      </form>
    </Provider>
  );
};
