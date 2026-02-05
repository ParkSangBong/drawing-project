import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateDrawingSchema = z.object({
  // fileName: z.string().min(1).describe('도면 파일명'),
  fileName: z.string().optional().describe('도면 파일명 (없으면 파일 원본 이름 사용)'),
});

export class CreateDrawingDto extends createZodDto(CreateDrawingSchema) {}