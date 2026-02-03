import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DrizzleService } from '../db/drizzle/drizzle.service';
import { drawings } from '../db/schema';
import { DrawingsGateway } from './drawings.gateway';
import { eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';

// 👇 [변경] 최신 Gemini 3 SDK 임포트
import { GoogleGenAI } from "@google/genai";
import Drawing from 'dxf-writer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DrawingsService {
  // 👇 [변경] 타입 변경
  private genAI: GoogleGenAI;
  private readonly logger = new Logger(DrawingsService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    @InjectQueue('drawing-conversion') private conversionQueue: Queue,
    private readonly drawingsGateway: DrawingsGateway,
    private readonly configService: ConfigService,
  ) {
    // 🛠️ [설정] .env에서 가져오거나, 테스트용으로 직접 입력하세요.
    // const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const apiKey = "AIzaSyAORVgdDZ91d9hx_MjmFzJ4wB2RyJ5yJIY"; // 사용자님 키 유지

    if (!apiKey) {
      this.logger.warn('⚠️ GEMINI_API_KEY가 설정되지 않았습니다.');
    } else {
      this.logger.log(`🔑 API Key 적용됨: ${apiKey.substring(0, 5)}...`);
    }
      
    // 👇 [변경] Gemini 3 초기화 방식 (객체 형태 { apiKey: ... })
    this.genAI = new GoogleGenAI({ apiKey: apiKey });
  }

  // =================================================================
  // 🚀 [NEW] Gemini 3 AI 변환 로직
  // =================================================================

  async convertWithGemini(file: Express.Multer.File): Promise<any> {
    try {
      this.logger.log('🤖 Gemini 3 AI 분석 시작...');
      
      // 1. 이미지 분석 요청
      const designData = await this.analyzeImage(file.buffer);
      this.logger.log(`📊 분석 완료! 데이터: ${JSON.stringify(designData, null, 2)}`);

      // 2. DXF 파일 생성
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
        aiData: designData 
      };

    } catch (error) {
      this.logger.error(`❌ AI 변환 실패: ${error}`);
      throw new InternalServerErrorException(`AI 변환 중 오류 발생: ${error.message}`);
    }
  }

  // 👇 [변경] Gemini 3 API 호출 방식 (핵심 변경 구간)
  // private async analyzeImage(imageBuffer: Buffer): Promise<any> {
  //   const base64Image = imageBuffer.toString('base64');

  //   const prompt = `
  //     You are an expert mechanical engineer. Analyze this technical drawing image.
  //     Extract geometric shapes and dimensions.
      
  //     Return ONLY a raw JSON object with this structure:
  //     {
  //       "elements": [
  //         { "type": "CIRCLE", "x": 0, "y": 0, "r": 10 },
  //         { "type": "LINE", "x1": 0, "y1": 0, "x2": 10, "y2": 0 },
  //         { "type": "TEXT", "x": 5, "y": 5, "content": "M10", "height": 5 }
  //       ]
  //     }
  //     Coordinates Guide: Assume bottom-left of the main object is (0,0).
  //   `;

  //   // 👇 [변경] GoogleGenAI v1beta (Gemini 3) 호출 문법
  //   const response = await this.genAI.models.generateContent({
  //     model: "gemini-3-flash-preview", // 👈 아까 확인한 최신 모델명!
  //     contents: [
  //       {
  //         parts: [
  //           { text: prompt },
  //           { 
  //             inlineData: { 
  //               mimeType: "image/jpeg", 
  //               data: base64Image 
  //             } 
  //           }
  //         ]
  //       }
  //     ],
  //     // 👇 [신규] JSON 모드 강제 (Gemini 3 기능)
  //     config: {
  //       responseMimeType: "application/json", 
  //     }
  //   });

  //   // 👇 [변경] 응답 데이터 추출 (response.text)
  //   let text = response.text;

  //   if (!text) {
  //     throw new Error('Gemini가 텍스트를 반환하지 않았습니다. (Empty Response)');
  //   } else {
  //     text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  //   }
    
  //   // // 안전장치: 혹시 모를 마크다운 제거
  //   // if (text) {
  //   //     text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  //   // }
    
  //   return JSON.parse(text);
  // }

  // backend-api/src/drawings/drawings.service.ts

  // private async analyzeImage(imageBuffer: Buffer): Promise<any> {
  //   const base64Image = imageBuffer.toString('base64');

  //   // 👇 [수정] 프롬프트를 훨씬 구체적이고 강력하게 업그레이드했습니다.
  //   const prompt = `
  //     Role: You are a Senior Mechanical Design Engineer & CAD Expert.
  //     Task: Convert this hand-drawn mechanical sketch into a precise 2D DXF coordinate set.
      
  //     [Critical Analysis Rules]
  //     1. **Orthographic Projection**: Recognize that this image likely contains multiple views (e.g., Top View, Front View) of the SAME part. Align them vertically or horizontally.
  //     2. **Shape correction**: 
  //        - A rough circle clearly drawn as a fastener head is a CIRCLE.
  //        - A rough polygon clearly drawn as a nut/bolt head is a POLYGON (likely Hexagon). Do NOT simplify a hexagon into a circle.
  //        - Rough lines clearly meant to be straight must be perfectly STRAIGHT lines (axis-aligned if applicable).
  //     3. **Centerlines**: Identifying the center axis is crucial. All cylindrical parts must be aligned to this axis.
  //     4. **Details**:
  //        - Recognize 'X' or cross-hatching patterns inside a rectangle as a "Section View" or solid material -> Draw the boundary box.
  //        - Recognize dotted lines as "Hidden Lines".
      
  //     [Extraction Requirements]
  //     Extract ALL geometric elements.
  //     - If you see a Hexagon, compose it using 6 LINE elements.
  //     - Convert handwritten dimensions (e.g., "37", "M10") into TEXT elements placed near their reference.
      
  //     Return ONLY a raw JSON object with this strict structure:
  //     {
  //       "elements": [
  //         { "type": "CIRCLE", "x": 100, "y": 100, "r": 20 },
  //         { "type": "LINE", "x1": 0, "y1": 0, "x2": 100, "y2": 0 },
  //         { "type": "TEXT", "x": 50, "y": 50, "content": "M10", "height": 5 }
  //       ]
  //     }
      
  //     [Coordinate System]
  //     - Use a Cartesian coordinate system relative to the image pixels.
  //     - Invert Y-axis if necessary so the drawing is upright.
  //     - Ensure the "Top View" is placed above the "Front View".
  //   `;

  //   const response = await this.genAI.models.generateContent({
  //     model: "gemini-3-flash-preview", 
  //     contents: [
  //       {
  //         parts: [
  //           { text: prompt },
  //           { 
  //             inlineData: { 
  //               mimeType: "image/jpeg", 
  //               data: base64Image 
  //             } 
  //           }
  //         ]
  //       }
  //     ],
  //     config: {
  //       responseMimeType: "application/json", 
  //     }
  //   });

  //   let text = response.text;

  //   if (!text) {
  //     throw new Error('Gemini가 텍스트를 반환하지 않았습니다. (Empty Response)');
  //   } else {
  //     text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  //   }

  //   text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
  //   return JSON.parse(text);
  // }

  // backend-api/src/drawings/drawings.service.ts

  // private async analyzeImage(imageBuffer: Buffer): Promise<any> {
  //   const base64Image = imageBuffer.toString('base64');

  //   // 👇 [변경] AI를 '단순 화가'에서 'CAD 설계자'로 승격시키는 프롬프트
  //   const prompt = `
  //     Role: Senior Mechanical Design Engineer.
  //     Task: Reverse-engineer this hand-drawn sketch into a PRECISE technical drawing (DXF format).
      
  //     [CRITICAL RULES - Do Not Just Trace]
  //     1. **Geometric Correction**: 
  //        - Hand-drawn lines are never perfect. You MUST output PERFECTLY STRAIGHT lines and PERFECT CIRCLES.
  //        - If a shape looks like a polygon (e.g., Nut Head), draw a PERFECT HEXAGON (6 lines), even if the sketch is round.
      
  //     2. **Read the Engineering Intent**:
  //        - Read the handwritten text.
  //        - If text says "Hex" or shows a nut, the Top View MUST be a Hexagon inside a Circle.
  //        - If text says "Section" or you see cross pattern, draw Diagonal Hatching Lines (////) in the Front View.
      
  //     3. **Alignment & Projection**:
  //        - The Top View and Front View MUST be aligned vertically (share the same Center X).
  //        - Do not treat them as separate drawings. They are ONE part.
      
  //     [Output Schema]
  //     Return ONLY a JSON object with this structure. 
  //     Use "description" to explain what part it is (e.g., "Bolt Head", "Hatching").
      
  //     {
  //       "elements": [
  //         { "type": "LINE", "x1": 0, "y1": 0, "x2": 100, "y2": 0, "description": "Base Line" },
  //         { "type": "CIRCLE", "x": 50, "y": 50, "r": 20, "description": "Outer Diameter" }
  //         // Generate lines for Hexagon and Hatching as well
  //       ]
  //     }
  //   `;

  //   const response = await this.genAI.models.generateContent({
  //     model: "gemini-3-flash-preview", // 만약 계속 503 에러나면 "gemini-1.5-pro"로 변경 고려
  //     contents: [
  //       {
  //         parts: [
  //           { text: prompt },
  //           { 
  //             inlineData: { 
  //               mimeType: "image/jpeg", 
  //               data: base64Image 
  //             } 
  //           }
  //         ]
  //       }
  //     ],
  //     config: {
  //       responseMimeType: "application/json", 
  //     }
  //   });

  //   let text = response.text;

  //   if (!text) {
  //     throw new Error('Gemini가 텍스트를 반환하지 않았습니다. (Empty Response)');
  //   } else {
  //     text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  //   }

  //   text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
  //   return JSON.parse(text);
  // }

  // backend-api/src/drawings/drawings.service.ts

  private async analyzeImage(imageBuffer: Buffer): Promise<any> {
    const base64Image = imageBuffer.toString('base64');

    // 💡 [핵심] 'after.jpg'의 특징을 JSON 예시로 만들어서 프롬프트에 심었습니다.
    const perfectExample = {
      elements: [
        // 1. 평면도 (Top View): 원 안에 육각형이 있는 형태
        { type: "CIRCLE", x: 200, y: 100, r: 28, description: "Top View - Outer Circle (Φ28)" },
        { type: "LINE", x1: 186, y1: 100, x2: 193, y2: 112, description: "Top View - Hexagon Edge 1" },
        { type: "LINE", x1: 193, y1: 112, x2: 207, y2: 112, description: "Top View - Hexagon Edge 2" },
        // ... (육각형 나머지 선들) ...
        
        // 2. 정면도 (Front View): 단면 빗금(Hatching)이 있는 형태
        { type: "LINE", x1: 172, y1: 200, x2: 228, y2: 200, description: "Front View - Top Edge" },
        { type: "LINE", x1: 172, y1: 200, x2: 172, y2: 237, description: "Front View - Left Edge (Height 37)" },
        { type: "LINE", x1: 175, y1: 205, x2: 185, y2: 215, description: "Hatching Line (Diagonal)" },
        { type: "LINE", x1: 180, y1: 205, x2: 190, y2: 215, description: "Hatching Line (Diagonal)" },
        
        // 3. 치수 텍스트
        { type: "TEXT", x: 230, y: 218, content: "37", height: 3.5, description: "Height Dimension" },
        { type: "TEXT", x: 200, y: 80, content: "M10", height: 3.5, description: "Inner Thread Spec" }
      ]
    };

    const prompt = `
      Role: Expert Senior Mechanical Drafter.
      Task: Reverse-engineer the attached hand-drawn sketch into a PROFESSIONAL CAD drawing (DXF data).
      
      [LEARNING FROM EXAMPLES (Few-Shot Learning)]
      I will show you how to convert a sketch into a perfect drawing.
      
      **Example Input (Mental Image):** A rough hand sketch of a Hexagon Nut. Lines are wobbly, circles are not round.
      Text "M10" and "37" is written messily.
      
      **Example Ideal Output (The standard you must follow):**
      ${JSON.stringify(perfectExample)}
      
      ----------------------------------------------------------------
      
      [YOUR MISSION]
      Now, analyze the ATTACHED IMAGE and generate JSON with the same high quality.
      
      [STRICT RULES for RECONSTRUCTION]
      1. **Hexagon Recognition**: 
         - If the sketch implies a nut/bolt head, draw a PERFECT HEXAGON (6 connected lines), even if the sketch looks like a circle.
         - Do NOT simplify it.
      
      2. **Hatching (Section View)**:
         - If you see a cross/X pattern or "Section" text, draw multiple diagonal lines (////) to represent solid material.
      
      3. **Alignment**:
         - The Top View (Circle/Hex) must be vertically aligned with the Front View (Rectangle).
         - They share the same Center X coordinate.
         
      4. **Real Dimensions**:
         - Read numbers like "37", "28", "10". 
         - Scale your drawing coordinates to match these relative proportions approximately.
      
      Return ONLY the raw JSON object.
    `;

    const response = await this.genAI.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: [
        {
          parts: [
            { text: prompt },
            { 
              inlineData: { 
                mimeType: "image/jpeg", 
                data: base64Image 
              } 
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json", 
      }
    });

    let text = response.text;
    if (!text) {
      throw new Error('Gemini가 텍스트를 반환하지 않았습니다. (Empty Response)');
    } else {
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    
    // 마크다운 제거
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(text);
  }

  // [Private] DXF 생성 (기존 유지)
  private createDxf(data: any): string {
    const d = new Drawing();
    d.setUnits('Millimeters');

    if (data.elements) {
      data.elements.forEach((el: any) => {
        // 대소문자 호환성 처리
        const type = el.type ? el.type.toUpperCase() : '';
        
        if (type === 'CIRCLE') d.drawCircle(el.x, el.y, el.r);
        else if (type === 'LINE') d.drawLine(el.x1, el.y1, el.x2, el.y2);
        else if (type === 'TEXT') d.drawText(el.x, el.y, el.height, 0, el.content);
      });
    }
    return d.toDxfString();
  }

  // =================================================================
  // 📦 [EXISTING] 기존 코드 (파이썬 엔진 연결용 - 유지)
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