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
    const { drawingId, status, previewUrl, extractedDimensions, startTime } = job.data; // previewUrl 추가 수신

    console.log(`📩 From Python RESULT : ID ${drawingId} -> ${status}`);

    // 🚀 디버깅 로그 추가: 실제로 데이터가 들어오는지 확인
    console.log(`[DEBUG] 수신 데이터 확인 - ID: ${drawingId}, startTime: ${startTime}`);

    if (startTime) {
      const start = Number(startTime); // 명시적 숫자 변환
      const now = Date.now();
      
      if (!isNaN(start)) {
        const duration = (now - start) / 1000;
        console.log(`📩 [엔진 응답 수신] ID: ${drawingId} (${status})`);
        console.log(`⏱️ [성능 측정] 전체 소요 시간: ${duration.toFixed(2)}초`);
      } else {
        console.warn(`⚠️ [성능 측정 실패] startTime이 유효한 숫자가 아닙니다: ${startTime}`);
      }
    } else {
      // 🚀 만약 이게 찍힌다면 파이썬에서 데이터가 안 넘어온 것입니다.
      console.warn(`⚠️ [성능 데이터 누락] ID: ${drawingId} 작업에 startTime이 없습니다.`);
    }

    

    // if (status === 'PREVIEW_READY') {
    //   // 🚀 [핵심] 파이썬이 만든 미리보기 주소를 프론트엔드에 즉시 전송
    //   this.drawingsGateway.server.emit('previewReady', {
    //     drawingId,
    //     previewUrl,
    //     extractedDimensions,
    //   });
    //   console.log(`✅ 프론트엔드로 미리보기 알림 발송 완료`);
    if (status === 'PREVIEW_READY') {
      // 🚀 [수정] 전체 방송(emit) 대신, 특정 유저에게만 보냅니다.
      // job.data에 socketId가 포함되어 있어야 합니다. (아래 Service 수정 참고)
      const { socketId } = job.data; 
      
      this.drawingsGateway.sendPreviewReady(socketId, {
        drawingId,
        previewUrl,
        extractedDimensions,
      });
      console.log(`✅ [${socketId}] 유저에게 미리보기 알림 발송 완료`);
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