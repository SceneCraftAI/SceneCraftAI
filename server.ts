import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // In-memory state for coworking (in a real app, this would be in a database)
  const coworkingTopics: any[] = [];
  const coworkingMessages: Record<string, any[]> = {};
  const users: any[] = [];

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Send initial data
    socket.emit("initial-data", {
      topics: coworkingTopics,
      users: users
    });

    socket.on("register-user", (user) => {
      const existingUserIndex = users.findIndex(u => u.uid === user.uid);
      if (existingUserIndex > -1) {
        users[existingUserIndex] = { ...user, socketId: socket.id };
      } else {
        users.push({ ...user, socketId: socket.id });
      }
      console.log(`User registered: ${user.displayName}#${user.hashtag}`);
    });

    socket.on("join-topic", (topicId) => {
      socket.join(topicId);
      console.log(`User ${socket.id} joined topic ${topicId}`);
      // Send message history
      socket.emit("message-history", coworkingMessages[topicId] || []);
    });

    socket.on("send-message", (data) => {
      const { topicId, message } = data;
      if (!coworkingMessages[topicId]) coworkingMessages[topicId] = [];
      coworkingMessages[topicId].push(message);
      io.to(topicId).emit("new-message", message);
    });

    socket.on("create-topic", (topic) => {
      coworkingTopics.push(topic);
      coworkingMessages[topic.id] = [];
      io.emit("topic-created", topic);
    });

    socket.on("invite-user", (data) => {
      const { topicId, identifier, inviter } = data;
      // Find user by email or Name#Hashtag
      const targetUser = users.find(u => 
        u.email === identifier || 
        (`${u.displayName}#${u.hashtag}` === identifier)
      );

      if (targetUser && targetUser.socketId) {
        io.to(targetUser.socketId).emit("invitation-received", {
          topicId,
          topicTitle: coworkingTopics.find(t => t.id === topicId)?.title,
          inviter
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
