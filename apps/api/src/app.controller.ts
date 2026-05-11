import { Controller, Get } from '@nestjs/common';
import { getTenantId } from '@shipyard/db';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  /** 動作確認用: AsyncLocalStorage に入っている tenantId を返す(無ければ null) */
  @Get('tenant-context')
  getTenantContext() {
    return { tenantId: getTenantId() ?? null };
  }
}
