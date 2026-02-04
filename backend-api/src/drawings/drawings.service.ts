import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DrizzleService } from '../db/drizzle/drizzle.service';
import { drawings } from '../db/schema';
import { DrawingsGateway } from './drawings.gateway';
import { eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';

import { GoogleGenAI } from "@google/genai";
import Drawing from 'dxf-writer';
import * as fs from 'fs';
import * as path from 'path';

// 1. 공통 속성 정의
interface BaseElement {
  description?: string; // 디버깅용 설명 (선택 사항)
}

// 2. 원(Circle) 타입 정의
interface DxfCircle extends BaseElement {
  type: 'CIRCLE';
  x: number;
  y: number;
  r: number;
}

// 3. 선(Line) 타입 정의
interface DxfLine extends BaseElement {
  type: 'LINE';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// 4. 텍스트(Text) 타입 정의
interface DxfText extends BaseElement {
  type: 'TEXT';
  x: number;
  y: number;
  content: string;
  height: number;
}

// 5. [핵심] 이 모든 걸 하나로 묶는 유니온 타입
type DxfElement = DxfCircle | DxfLine | DxfText;

@Injectable()
export class DrawingsService {
  private genAI: GoogleGenAI;
  private readonly logger = new Logger(DrawingsService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    @InjectQueue('drawing-conversion') private conversionQueue: Queue,
    private readonly drawingsGateway: DrawingsGateway,
    private readonly configService: ConfigService,
  ) {
    // 🛠️ [설정] API Key
    const apiKey = "AIzaSyAORVgdDZ91d9hx_MjmFzJ4wB2RyJ5yJIY"; // 사용자님 키 유지

    if (!apiKey) {
      this.logger.warn('⚠️ GEMINI_API_KEY가 설정되지 않았습니다.');
    } else {
      this.logger.log(`🔑 API Key 적용됨: ${apiKey.substring(0, 5)}...`);
    }
      
    // Gemini 3 초기화
    this.genAI = new GoogleGenAI({ apiKey: apiKey });
  }

  // =================================================================
  // 🚀 [NEW] Gemini 3 AI + 파라메트릭 변환 로직
  // =================================================================

  async convertWithGemini(file: Express.Multer.File): Promise<any> {
    try {
      this.logger.log('🤖 Gemini 3 AI (파라메트릭 모드) 분석 시작...');
      
      // 1. 이미지에서 치수 데이터 추출 + 도면 생성
      const designData = await this.analyzeImage(file.buffer);
      this.logger.log(`📊 생성된 도면 요소 수: ${designData.elements.length}개`);

      // 2. DXF 파일 생성 (dxf-writer 사용)
      const dxfContent = this.createDxf(designData);
      
      // 3. 파일 저장
      const fileName = `ai_drawing_${Date.now()}.dxf`;
      const uploadDir = path.join(process.cwd(), 'uploads');
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const uploadPath = path.join(uploadDir, fileName);
      fs.writeFileSync(uploadPath, dxfContent);
      this.logger.log(`💾 DXF 파일 저장 완료: ${fileName}`);
      
      return {
        success: true,
        message: '변환 성공',
        dxfUrl: `/uploads/${fileName}`,
        aiData: designData // 프론트엔드 디버깅용 데이터
      };

    } catch (error) {
      this.logger.error(`❌ AI 변환 실패: ${error}`);
      throw new InternalServerErrorException(`AI 변환 중 오류 발생: ${error.message}`);
    }
  }

  // 👇 [핵심 변경] 이미지를 분석하여 '그림'이 아닌 '치수(Spec)'를 추출
  private async analyzeImage(imageBuffer: Buffer): Promise<any> {
    const base64Image = imageBuffer.toString('base64');

    const prompt = `
      Role: Senior Mechanical Engineer.
      Task: Extract geometric parameters from the hand sketch of a Hexagon Nut/Bolt.
      
      [Input Analysis]
      Look at the handwritten numbers and shapes. Extract these values:
      1. **hexWidth**: The size of the hexagon head (e.g., "24", "17").
      2. **totalHeight**: The total vertical length (e.g., "37", "30").
      3. **outerDiameter**: The widest round part diameter (e.g., "28").
      4. **threadDia**: The thread specification number (e.g., M10 -> 10, M12 -> 12).
      5. **stepHeight**: If there is a step/flange, its height (e.g., "6", "5").
      
      [Output Format - STRICT JSON]
      Return ONLY this JSON object. Use null or reasonable guess (based on ISO standards) if text is unreadable.
      {
        "hexWidth": 24,
        "totalHeight": 37,
        "outerDiameter": 28, 
        "threadDia": 10,
        "stepHeight": 6
      }
    `;

    const response = await this.genAI.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }
      ],
      config: { responseMimeType: "application/json" }
    });

    let text = response.text;
    if (!text) {
      throw new Error('Gemini가 텍스트를 반환하지 않았습니다.');
    } 

    // 마크다운 제거 및 파싱
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const extractedParams = JSON.parse(text);

    this.logger.log(`🔍 AI 추출 파라미터: ${JSON.stringify(extractedParams)}`);

    // 💡 [핵심] 추출된 파라미터를 사용해 코드가 완벽한 도면을 그립니다.
    return this.generatePerfectDxf(extractedParams);
  }

  // 👇 [신규] 수학적으로 완벽한 DXF 요소를 생성하는 함수 (Parametric Engine)
  // private generatePerfectDxf(data: any): any {
  //   const elements = [];
    
  //   // 기본값 설정 (AI가 못 찾으면 기본값 사용 - 안전장치)
  //   const H = data.totalHeight || 37;
  //   const W = data.hexWidth || 24;      // 육각 대변 거리
  //   const D = data.outerDiameter || 28; // 외경
  //   const M = data.threadDia || 10;     // 나사 내경
  //   const SH = data.stepHeight || 6;    // 단 높이

  //   // ==========================================
  //   // 📐 [Top View] - 위쪽: 완벽한 육각형과 원
  //   // ==========================================
  //   const cx = 0, cy = H * 1.5 + 20; // Y축 위쪽에 배치 (Front View와 겹치지 않게)
    
  //   // 1. 외경 원
  //   elements.push({ type: "CIRCLE", x: cx, y: cy, r: D/2, description: "Top View Outer" });
    
  //   // 2. 나사 구멍
  //   elements.push({ type: "CIRCLE", x: cx, y: cy, r: M/2, description: "Thread Hole" });
    
  //   // 3. 육각형 (Hexagon) - 삼각함수로 좌표 계산
  //   const hexRadius = (W / 2) / Math.cos(30 * Math.PI / 180); // 대변거리 -> 외접원 반경 변환
  //   for (let i = 0; i < 6; i++) {
  //       const angle_deg = 30 + 60 * i;
  //       const angle_rad = angle_deg * (Math.PI / 180);
  //       const next_angle_rad = (30 + 60 * (i + 1)) * (Math.PI / 180);
        
  //       elements.push({
  //           type: "LINE",
  //           x1: cx + hexRadius * Math.cos(angle_rad),
  //           y1: cy + hexRadius * Math.sin(angle_rad),
  //           x2: cx + hexRadius * Math.cos(next_angle_rad),
  //           y2: cy + hexRadius * Math.sin(next_angle_rad),
  //           description: "Hexagon Edge"
  //       });
  //   }

  //   // ==========================================
  //   // 📐 [Front View] - 아래쪽: 단면도 (Section View)
  //   // ==========================================
  //   // 바닥 중심점 (0,0)
  //   const halfD = D / 2;
  //   const halfM = M / 2;

  //   // 4. 전체 외곽 사각형
  //   elements.push({ type: "LINE", x1: -halfD, y1: 0, x2: halfD, y2: 0 });      // 바닥
  //   elements.push({ type: "LINE", x1: -halfD, y1: H, x2: halfD, y2: H });      // 천장
  //   elements.push({ type: "LINE", x1: -halfD, y1: 0, x2: -halfD, y2: H });     // 왼쪽 벽
  //   elements.push({ type: "LINE", x1: halfD, y1: 0, x2: halfD, y2: H });       // 오른쪽 벽

  //   // 5. 단(Step) 표현 (있는 경우)
  //   if (SH > 0) {
  //       elements.push({ type: "LINE", x1: -halfD, y1: SH, x2: halfD, y2: SH, description: "Step Line" });
  //   }

  //   // 6. 중심선 (Center Line)
  //   elements.push({ type: "LINE", x1: 0, y1: -5, x2: 0, y2: H + 5, description: "Center Line" });

  //   // 7. 나사 구멍 (내부선)
  //   elements.push({ type: "LINE", x1: -halfM, y1: 0, x2: -halfM, y2: H, description: "Inner Hole L" });
  //   elements.push({ type: "LINE", x1: halfM, y1: 0, x2: halfM, y2: H, description: "Inner Hole R" });

  //   // 8. 해칭 (빗금 ////) - 깔끔한 빗금 생성
  //   const hatchSpacing = 3;
  //   // 왼쪽 빗금 (외경~내경 사이)
  //   for(let y = 0; y < H; y += hatchSpacing) {
  //       elements.push({ type: "LINE", x1: -halfD, y1: y, x2: -halfM, y2: y + hatchSpacing });
  //   }
  //   // 오른쪽 빗금 (내경~외경 사이)
  //   for(let y = 0; y < H; y += hatchSpacing) {
  //       elements.push({ type: "LINE", x1: halfM, y1: y, x2: halfD, y2: y + hatchSpacing });
  //   }
    
  //   // ==========================================
  //   // 📐 [Dimensions] - 치수 텍스트
  //   // ==========================================
  //   elements.push({ type: "TEXT", x: halfD + 5, y: H/2, content: `H=${H}`, height: 3 });
  //   elements.push({ type: "TEXT", x: -halfD - 15, y: H/2, content: `Hex=${W}`, height: 3 });
  //   elements.push({ type: "TEXT", x: 0, y: H + 8, content: `M${M}`, height: 3 });

  //   return { elements };
  // }

  // [신규] 수학적으로 완벽한 DXF 요소를 생성하는 함수 (Parametric Engine)
  private generatePerfectDxf(data: any): any {
    // 👇 [수정] 여기에 ': any[]' 타입을 추가해서 무엇이든 담을 수 있게 해줍니다.
    const elements: any[] = []; 
    
    // 기본값 설정 (AI가 못 찾으면 기본값 사용 - 안전장치)
    const H = data.totalHeight || 37;
    const W = data.hexWidth || 24;      // 육각 대변 거리
    const D = data.outerDiameter || 28; // 외경
    const M = data.threadDia || 10;     // 나사 내경
    const SH = data.stepHeight || 6;    // 단 높이

    // ==========================================
    // 📐 [Top View] - 위쪽: 완벽한 육각형과 원
    // ==========================================
    const cx = 0, cy = H * 1.5 + 20; // Y축 위쪽에 배치
    
    // 1. 외경 원
    elements.push({ type: "CIRCLE", x: cx, y: cy, r: D/2, description: "Top View Outer" });
    
    // 2. 나사 구멍
    elements.push({ type: "CIRCLE", x: cx, y: cy, r: M/2, description: "Thread Hole" });
    
    // 3. 육각형 (Hexagon) - 삼각함수로 좌표 계산
    const hexRadius = (W / 2) / Math.cos(30 * Math.PI / 180); // 대변거리 -> 외접원 반경 변환
    for (let i = 0; i < 6; i++) {
        const angle_deg = 30 + 60 * i;
        const angle_rad = angle_deg * (Math.PI / 180);
        const next_angle_rad = (30 + 60 * (i + 1)) * (Math.PI / 180);
        
        elements.push({
            type: "LINE",
            x1: cx + hexRadius * Math.cos(angle_rad),
            y1: cy + hexRadius * Math.sin(angle_rad),
            x2: cx + hexRadius * Math.cos(next_angle_rad),
            y2: cy + hexRadius * Math.sin(next_angle_rad),
            description: "Hexagon Edge"
        });
    }

    // ==========================================
    // 📐 [Front View] - 아래쪽: 단면도 (Section View)
    // ==========================================
    const halfD = D / 2;
    const halfM = M / 2;

    // 4. 전체 외곽 사각형
    elements.push({ type: "LINE", x1: -halfD, y1: 0, x2: halfD, y2: 0 });      // 바닥
    elements.push({ type: "LINE", x1: -halfD, y1: H, x2: halfD, y2: H });      // 천장
    elements.push({ type: "LINE", x1: -halfD, y1: 0, x2: -halfD, y2: H });     // 왼쪽 벽
    elements.push({ type: "LINE", x1: halfD, y1: 0, x2: halfD, y2: H });       // 오른쪽 벽

    // 5. 단(Step) 표현 (있는 경우)
    if (SH > 0) {
        elements.push({ type: "LINE", x1: -halfD, y1: SH, x2: halfD, y2: SH, description: "Step Line" });
    }

    // 6. 중심선 (Center Line)
    elements.push({ type: "LINE", x1: 0, y1: -5, x2: 0, y2: H + 5, description: "Center Line" });

    // 7. 나사 구멍 (내부선)
    elements.push({ type: "LINE", x1: -halfM, y1: 0, x2: -halfM, y2: H, description: "Inner Hole L" });
    elements.push({ type: "LINE", x1: halfM, y1: 0, x2: halfM, y2: H, description: "Inner Hole R" });

    // 8. 해칭 (빗금 ////)
    const hatchSpacing = 3;
    // 왼쪽 빗금
    for(let y = 0; y < H; y += hatchSpacing) {
        elements.push({ type: "LINE", x1: -halfD, y1: y, x2: -halfM, y2: y + hatchSpacing });
    }
    // 오른쪽 빗금
    for(let y = 0; y < H; y += hatchSpacing) {
        elements.push({ type: "LINE", x1: halfM, y1: y, x2: halfD, y2: y + hatchSpacing });
    }
    
    // ==========================================
    // 📐 [Dimensions] - 치수 텍스트
    // ==========================================
    elements.push({ type: "TEXT", x: halfD + 5, y: H/2, content: `H=${H}`, height: 3 });
    elements.push({ type: "TEXT", x: -halfD - 15, y: H/2, content: `Hex=${W}`, height: 3 });
    elements.push({ type: "TEXT", x: 0, y: H + 8, content: `M${M}`, height: 3 });

    return { elements };
  }

  // [기존 유지] DXF 생성기
  private createDxf(data: any): string {
    const d = new Drawing();
    d.setUnits('Millimeters');

    if (data.elements) {
      data.elements.forEach((el: any) => {
        const type = el.type ? el.type.toUpperCase() : '';
        
        if (type === 'CIRCLE') d.drawCircle(el.x, el.y, el.r);
        else if (type === 'LINE') d.drawLine(el.x1, el.y1, el.x2, el.y2);
        else if (type === 'TEXT') d.drawText(el.x, el.y, el.height, 0, el.content);
      });
    }
    return d.toDxfString();
  }

  // =================================================================
  // 📦 [EXISTING] DB 및 큐 로직 (변경 없음)
  // =================================================================

  async requestPreview(id: number, params: any) {
    const drawing = await this.drizzle.db
      .select()
      .from(drawings)
      .where(eq(drawings.id, id))
      .then(res => res[0]);

    if (!drawing) {
      this.logger.error(`❌ [Service] 도면을 찾을 수 없습니다: ID ${id}`);
      return;
    }

    try {
      const startTime = Date.now();
      await this.conversionQueue.add('convert', {
        drawingId: id,
        filePath: drawing.originalUrl,
        startTime,
        ...params 
      }, { 
        jobId: `${params.mode}-${id}-${startTime}`, 
        removeOnComplete: true 
      });

      this.logger.log(`📡 [${params.mode}] 큐 전송 완료 (ID: ${id})`);
    } catch (error) {
      this.logger.error('❌ Redis 작업 추가 실패:', error);
    }
  }

  async updateStatus(id: number, status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED') {
    this.logger.log(`[Status Update] ID: ${id} -> ${status}`);

    await this.drizzle.db
      .update(drawings)
      .set({ status: status })
      .where(eq(drawings.id, id));

    if (status === 'COMPLETED') {
      this.logger.log(`[WebSocket] ${id}번 도면 변환 완료 신호 발송!`);
      this.drawingsGateway.sendUpdateNotification(id);
    }
  }

  async create(fileName: string, filePath: string) {
    const result = await this.drizzle.db.insert(drawings).values({
      fileName: fileName,
      originalUrl: filePath,
      status: 'PENDING',
    });
  
    const drawingId = (result as any)[0].insertId; 
    const startTime = Date.now();

    this.logger.log(`Attempting to add job to Redis: drawingId=${drawingId}`);
  
    try {
      const job = await this.conversionQueue.add('convert', {
        drawingId: drawingId,
        filePath: filePath,
        startTime,
      });
      this.logger.log(`✅ Job added to Redis successfully! Job ID: ${job.id}`);
    } catch (error) {
      this.logger.error('❌ Failed to add job to Redis:', error);
    }
  
    return { 
      success: true, 
      message: '도면 접수 및 변환 작업이 대기열에 추가되었습니다.',
      drawingId: drawingId 
    };
  }

  async findAll() {
    return await this.drizzle.db.select().from(drawings);
  }
}