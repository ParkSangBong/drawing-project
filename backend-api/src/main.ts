import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);  
    app.enableCors({
        origin: '*',
    })
    const config = new DocumentBuilder()
        .setTitle('Drawing Service Project API')
        .setDescription('도면 변환 플랫폼 API 명세서')
        .setVersion('1.0')
        .build();

    const documnet = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documnet)

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

// const app = await NestFactory.create(AppModule);
  
//   // CORS 허용 설정 추가
//   app.enableCors({
//     origin: '*', // 실무에서는 특정 도메인만 허용하지만, 현재는 테스트를 위해 전체 허용
//   });

//   // ... 기존 Swagger 설정 ...
//   await app.listen(3000);

// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   // Swagger 설정
//   const config = new DocumentBuilder()
//     .setTitle('Mom Drawing Project API')
//     .setDescription('어머님 도면 변환 플랫폼 API 명세서')
//     .setVersion('1.0')
//     .build();
  
//   const document = SwaggerModule.createDocument(app, config);
//   SwaggerModule.setup('api', app, document); // 브라우저에서 /api로 접속 가능

//   await app.listen(process.env.PORT ?? 3000);
// }
// bootstrap();