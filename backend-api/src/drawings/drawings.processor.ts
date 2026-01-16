import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DrizzleService } from '../db/drizzle/drizzle.service';
import { drawings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { DrawingsService } from './drawings.service';
import { DrawingsGateway } from './drawings.gateway';

@Processor('drawing-results') // 파이썬이 던지는 큐 이름
export class DrawingResultsProcessor extends WorkerHost {
  constructor(
    private readonly drawingsService: DrawingsService,
    private readonly drawingsGateway: DrawingsGateway,
  ) { // 서비스 주입
    super();
  }
  // constructor(private readonly drizzle: DrizzleService) {
  //   super();
  // }

  async process(job: Job<any>): Promise<any> {
    // const { drawingId, status } = job.data;
    const { drawingId, status, previewUrl } = job.data; // previewUrl 추가 수신

    console.log(`📩 From Python RESULT : ID ${drawingId} -> ${status}`);

    if (status === 'PREVIEW_READY') {
      // 🚀 [핵심] 파이썬이 만든 미리보기 주소를 프론트엔드에 즉시 전송
      this.drawingsGateway.server.emit('previewReady', {
        drawingId,
        previewUrl, // 예: uploads/filename_preview.png
      });
      console.log(`✅ 프론트엔드로 미리보기 알림 발송 완료`);
    } else {
      // 기존 최종 완료 처리 (COMPLETED 등)
      await this.drawingsService.updateStatus(drawingId, status);
    }

    // // DB 상태 업데이트
    // await this.drizzle.db
    //   .update(drawings)
    //   .set({ status: 'COMPLETED' })
    //   .where(eq(drawings.id, drawingId));

    // console.log(`✅ DB 업데이트 완료: ID ${drawingId}`);
    // console.log(`📩 From Python RESULT : ID ${drawingId} -> ${status}`);

    // 이제 직접 DB를 건드리지 않고, 서비스를 통해 업데이트합니다.
    // 여기서 웹소켓 알림이 자동으로 발송됩니다!
    // await this.drawingsService.updateStatus(drawingId, status);

    // console.log(`✅ 상태 업데이트 및 웹소켓 알림 처리 완료: ID ${drawingId}`);
  }
}