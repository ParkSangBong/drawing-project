import { Controller, Post, Get, UseInterceptors, UploadedFile, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import { DrawingsService } from './drawings.service';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CreateDrawingDto } from './dto/create-drawing.dto';

@ApiTags('Drawings (도면 관리)')
@Controller('drawings')
export class DrawingsController {
  constructor(private readonly drawingsService: DrawingsService) {}

  // =================================================================
  // 🚀 [NEW] AI 도면 변환 API
  // =================================================================
  @Post('ai-convert')
  @ApiOperation({ summary: 'AI를 이용한 도면 변환 (Gemini)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object', properties: { file: { type: 'string', format: 'binary' }, socketId: { type: 'string', example: 'abc-123' } },
    },
  })
  @UseInterceptors(FileInterceptor('file')) // 메모리에 파일 임시 저장 (DiskStorage 안 씀)
  async convertWithAi(@UploadedFile() file: Express.Multer.File, @Body('socketId') socketId: string) {
    // 바로 서비스 호출
    return this.drawingsService.convertWithGemini(file, socketId);
  }

  // =================================================================
  // 📦 [EXISTING] 기존 업로드 및 조회 API
  // =================================================================
  
  @Post('upload')
  @ApiOperation({ summary: '도면 이미지 업로드 (기존 방식)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object', properties: { 
        file: { type: 'string', format: 'binary' },
        fileName: { type: 'string', example: 'my_drawing' }, 
        socketId: { type: 'string', example: 'abc-123' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix = uuidv4();
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body() dto: CreateDrawingDto, @Body('socketId') socketId: string) {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    
    console.log('디코딩된 파일명:', originalName); 

    return this.drawingsService.create(originalName, file.path, socketId);
  }

  @Get()
  async findAll() {
    return this.drawingsService.findAll();
  }
}