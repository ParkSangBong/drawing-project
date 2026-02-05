import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateDrawingSchema = z.object({
  fileName: z.string().min(1).describe('도면 파일명'),
});

export class CreateDrawingDto extends createZodDto(CreateDrawingSchema) {}