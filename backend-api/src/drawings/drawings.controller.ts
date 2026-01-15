import { Controller, Post, Get, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import { DrawingsService } from './drawings.service';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Drawings (도면 관리)')
@Controller('drawings')
export class DrawingsController {
  constructor(private readonly drawingsService: DrawingsService) {}

  @Post('upload')
  @ApiOperation({ summary: '도면 이미지 업로드' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object', properties: { file: { type: 'string', format: 'binary' } },
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
  
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    // [추가] 한글 파일명 깨짐 방지 로직
    // 오리지널 이름을 Buffer를 이용해 latin1에서 utf8로 다시 인코딩합니다.
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    
    console.log('디코딩된 파일명:', originalName); // 터미널에서 한글이 잘 나오는지 확인용

    // 수정된 originalName을 서비스로 전달합니다.
    return this.drawingsService.create(originalName, file.path);
  }

  @Get()
  async findAll() {
    return this.drawingsService.findAll();
  }
}