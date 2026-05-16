import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';

@Global()
@Module({
  providers: [{ provide: AppConfigService, useFactory: () => new AppConfigService() }],
  exports: [AppConfigService],
})
export class AppConfigModule {}
