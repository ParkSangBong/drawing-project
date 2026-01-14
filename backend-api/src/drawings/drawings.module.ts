import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DrawingsService } from './drawings.service';
import { DrawingsController } from './drawings.controller';

@Module({
  imports: [
    // 큐 이름 등록
    BullModule.registerQueue({
      name: 'drawing-conversion',
    }),
  ],
  controllers: [DrawingsController],
  providers: [DrawingsService],
})
export class DrawingsModule {}