import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);  

    app.enableCors({
        origin: '*',
    });

    // 수정된 부분: 'upload' -> 'uploads' (실제 폴더명과 일치시켜야 합니다)
    // prefix도 '/uploads'로 설정하여 http://localhost:3000/uploads/파일명 으로 접속하게 합니다.
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
        prefix: '/uploads',
    });

    // 경로 확인용 로그 (서버 실행 시 터미널에 찍힙니다)
    console.log(`🚀 정적 파일 경로: ${join(process.cwd(), 'uploads')}`);

    const config = new DocumentBuilder()
        .setTitle('Drawing Service Project API')
        .setDescription('도면 변환 플랫폼 API 명세서')
        .setVersion('1.0')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();