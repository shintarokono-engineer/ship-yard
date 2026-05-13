import { IsIn } from 'class-validator';

import { Plan } from '@shipyard/db';

import type { PaidPlan } from '../../stripe/stripe.service';

/** `POST /workspaces/:slug/checkout-session` のリクエストボディ。 */
export class CreateCheckoutSessionDto {
  /** 切り替え先プラン。有料プランのみ(`@IsEnum(Plan)` だと FREE も許すので `@IsIn` で絞る)。 */
  @IsIn([Plan.PRO, Plan.TEAM])
  plan!: PaidPlan;
}
