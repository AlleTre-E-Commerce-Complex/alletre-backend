import { Logger, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Decimal } from '@prisma/client/runtime';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';

@WebSocketGateway()
export class BidsWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  constructor(
    private authService: AuthService,
    private prismaService: PrismaService,
  ) {}

  @WebSocketServer()
  server: Server;
  private logger: Logger = new Logger('BidsWebSocketGateway');

  onModuleInit() {
    this.logger.log('BidsWebSocketGateway Initialized ...');
  }
  handleDisconnect(socket: Socket) {
    socket.disconnect();
  }
  private disconnect(socket: Socket) {
    socket.disconnect();
  }
  async handleConnection(socket: Socket, ...args: any[]) {
    const { auctionId } = socket.handshake.query;
    socket.join(String(auctionId));

    const userPayload = this.authService.authenticateSocketUser(socket);
    if (!userPayload?.id) return;

    const user = await this.prismaService.user.findUnique({
      where: { id: userPayload.id },
    });

    if (user) {
      // Inject user into socket
      socket.data.user = user;
      // Update SocketId
      await this.prismaService.user.update({
        where: { id: userPayload.id },
        data: { socketId: socket.id },
      });
    } else {
      this.disconnect(socket);
    }
  }

  async userSubmitBidEventHandler(auctionId: number, bidAmount: Decimal) {
    // Send submitted bid to all listener sockets (bidders)
    this.server.to(String(auctionId)).emit('bid:submitted', { bidAmount });
  }
}
