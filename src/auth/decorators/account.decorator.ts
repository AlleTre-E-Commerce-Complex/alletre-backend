import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Account = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const account = request.account;

    return data ? account?.[data] : account;
  },
);
