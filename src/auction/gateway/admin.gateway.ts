import { Logger, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';

@WebSocketGateway({ cors: true, namespace: '/admin' }) // Use admin-specific namespace
export class AdminWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  constructor(
    private authService: AuthService,
    private prismaService: PrismaService,
  ) {}

  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('AdminWebSocketGateway');

  onModuleInit() {
    this.logger.log('AdminWebSocketGateway Initialized ...');
  }

  async handleConnection(socket: Socket) {
    const token = socket.handshake.headers['authorization']?.split(' ')[1];
    const auctionId = socket.handshake.query.auctionId; // Extract auctionId
    const userId = socket.handshake.query.userId; // Extract userId

    if (!token) {
      this.logger.warn('No token provided, disconnecting...');
      this.disconnect(socket);
      return;
    }

    try {
      const payload: any = await this.authService.verifyToken(token);
      if (!payload.roles.includes('admin')) {
        this.logger.warn(
          `User with ID ${payload.id} is not an admin, disconnecting...`,
        );
        this.disconnect(socket);
        return;
      }

      socket.join('admins');
      socket.data.user = { ...payload, auctionId, userId }; // Attach details for further use
      this.logger.log(`Admin connected with ID: ${payload.id}`);
    } catch (error) {
      this.logger.error(`Token validation failed: ${error.message}`);
      this.disconnect(socket);
    }
  }

  handleDisconnect(socket: Socket) {
    this.logger.log(`Admin disconnected: ${socket.id}`);
    socket.disconnect();
  }

  private disconnect(socket: Socket) {
    socket.disconnect();
  }

  emitEventToAdmins(eventName: string, data: any) {
    this.server.to('admins').emit(eventName, data);
    this.logger.log(`Event emitted to admins: ${eventName}`);
  }
}
