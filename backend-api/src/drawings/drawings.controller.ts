import { Controller, Post, Get, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { DrawingsService } from './drawings.service';

@ApiTags('Drawings (도면 관리)')
@Controller('drawings')
export class DrawingsController {
  constructor(private readonly drawingsService: DrawingsService) {}

  @Post('upload')
  @ApiOperation({ summary: '도면 이미지 업로드' })
  @ApiConsumes('multipart/form-data') // Swagger에서 파일 업로드 버튼을 활성화
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file')) // 'file'이라는 키로 들어온 파일을 가로챔
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    // 실제 서비스로 파일명과 경로를 넘김
    console.info('file.originalname : ', file.originalname)
    console.info('file.path : ', file.path)
    return this.drawingsService.create(file.originalname, file.path || 'temp_path');
  }

  @Get()
  @ApiOperation({ summary: '전체 도면 목록 조회' })
  async findAll() {
    return this.drawingsService.findAll();
  }
}