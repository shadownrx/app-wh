import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { verifyAccessToken } from "../lib/tokens";
import { prisma } from "../lib/prisma";
import { isParticipant } from "../lib/serializers";

export function attachSockets(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins.length ? env.corsOrigins : true, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? socket.handshake.query.token ?? "");
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    socket.on("join", async (connectionId: string) => {
      const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
      if (connection && isParticipant(connection, userId)) {
        socket.join(`match:${connectionId}`);
      }
    });

    socket.on("message", async (payload: { connectionId: string; content: string }) => {
      if (!payload?.connectionId || !payload?.content) return;
      const connection = await prisma.connection.findUnique({ where: { id: payload.connectionId } });
      if (!connection || !isParticipant(connection, userId)) return;
      const message = await prisma.message.create({
        data: {
          connectionId: payload.connectionId,
          senderId: userId,
          type: "TEXT",
          content: String(payload.content).slice(0, 2000),
        },
      });
      await prisma.connection.update({
        where: { id: connection.id },
        data: {
          lastMessageAt: new Date(),
          status: connection.status === "MATCH" ? "TALKING" : connection.status,
        },
      });
      io.to(`match:${connection.id}`).emit("message", message);
    });
  });

  return io;
}
