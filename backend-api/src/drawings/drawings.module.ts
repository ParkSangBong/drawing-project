import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DrawingsService } from './drawings.service';
import { DrawingsController } from './drawings.controller';
import { DrawingResultsProcessor } from './drawings.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'drawing-conversion' }),
    BullModule.registerQueue({ name: 'drawing-results' }), // 결과 큐 등록
  ],
  controllers: [DrawingsController],
  providers: [DrawingsService, DrawingResultsProcessor], // Processor 추가
})
export class DrawingsModule {}