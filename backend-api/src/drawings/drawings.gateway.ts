import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    SubscribeMessage,
  } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DrawingsService } from './drawings.service';
import { forwardRef, Inject } from '@nestjs/common';
  
  @WebSocketGateway({
    cors: {
      origin: '*', // 실무에서는 프론트엔드 주소만 허용하는 것이 좋습니다.
    },
  })
  export class DrawingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    constructor(
      @Inject(forwardRef(() => DrawingsService))
      private readonly drawingsService: DrawingsService
    ) {}
    
    @WebSocketServer()
    server: Server;
  
    // 클라이언트가 연결되었을 때
    handleConnection(client: Socket) {
      console.log(`클라이언트 연결됨: ${client.id}`);
    }
  
    // 클라이언트 연결이 끊겼을 때
    handleDisconnect(client: Socket) {
      console.log(`클라이언트 연결 끊김: ${client.id}`);
    }
  
    // 특정 작업 완료 알림을 모든 클라이언트에게 전송하는 함수
    sendUpdateNotification(drawingId: number) {
      this.server.emit('drawingUpdated', { id: drawingId });
    }

    @SubscribeMessage('adjustParameters')
    async handleAdjustParameters(@MessageBody() data: any) {
      console.info('📥 슬라이더 파라미터 수신:', data);

      await this.drawingsService.requestPreview(
        data.drawingId,
        data.blockSize,
        data.cValue,
        data.mode
      );
    }
  }