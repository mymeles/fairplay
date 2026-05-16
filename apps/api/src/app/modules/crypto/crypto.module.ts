import { Global, Module } from '@nestjs/common';
import { TokenEncryptionService } from '@fairplay/shared-utils';
import { AppConfigService } from '../config/app-config.service';

@Global()
@Module({
  providers: [
    {
      provide: TokenEncryptionService,
      useFactory: (config: AppConfigService) => new TokenEncryptionService(config.tokenEncryptionKey),
      inject: [AppConfigService],
    },
  ],
  exports: [TokenEncryptionService],
})
export class CryptoModule {}
