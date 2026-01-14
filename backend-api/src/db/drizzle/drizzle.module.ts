import { Module, Global } from '@nestjs/common';
import { DrizzleService } from './drizzle.service';

@Global() // 어디서든 주입받아 쓸 수 있게 Global로 설정합니다.
@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DrizzleModule {}