import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DrizzleService } from '../db/drizzle/drizzle.service';
import { drawings } from '../db/schema';
import { eq } from 'drizzle-orm';

@Processor('drawing-results') // 파이썬이 던지는 큐 이름
export class DrawingResultsProcessor extends WorkerHost {
  constructor(private readonly drizzle: DrizzleService) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { drawingId, status } = job.data;

    console.log(`📩 파이썬으로부터 결과 수신: ID ${drawingId} -> ${status}`);

    // DB 상태 업데이트
    await this.drizzle.db
      .update(drawings)
      .set({ status: 'COMPLETED' })
      .where(eq(drawings.id, drawingId));

    console.log(`✅ DB 업데이트 완료: ID ${drawingId}`);
  }
}