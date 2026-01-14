import express, { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { initializeAuth, authRouter } from "./auth.js";

dotenv.config();

import { OpenRouter } from "@openrouter/sdk";

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: "http://localhost:5173", // Allow frontend origin
    credentials: true, // Allow cookies
  })
);
app.use(express.json());

// Setup Authentication (async initialization)
// We start server after auth is initialized or just let it initialize in background
// Ideally we wait for it if critical, but for now we'll just fire it.
initializeAuth(app).then(() => {
  console.log("Auth initialized");
});

// Mount auth routes
app.use("/auth", authRouter);

/**
 * API Endpoint: /ask
 * Role: Connects to OpenRouter, asks a question, and logs the response.
 */
app.get("/ask", async (req: Request, res: Response) => {
  try {
    const question = req.body.question || (req.query.question as string);

    // Set headers for streaming response
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    // Stream the response to get reasoning tokens in usage
    const stream = await openrouter.chat.send({
      model: "deepseek/deepseek-r1-0528:free",
      // model: "xiaomi/mimo-v2-flash:free",
      // model: "z-ai/glm-4.5-air:free",
      // model: "mistralai/mistral-small-3.1-24b-instruct:free",
      messages: [
        {
          role: "user",
          content: question,
        },
      ],
      temperature: 0.4,
      topP: 0.85,
      presencePenalty: 0.3,
      maxCompletionTokens: 1000,
      stream: true,
      maxTokens: 1500,
      // plugins: [
      //   {
      //     id: "web",
      //     searchPrompt: question,
      //     maxResults: 1,
      //   },
      // ],
      streamOptions: {
        includeUsage: true,
      },
    });

    for await (const chunk of stream) {
      console.log("chunk:", chunk.choices);
      const content = chunk.choices[0]?.delta?.content;
      console.log("content:", content);

      if (content) {
        res.write(content);
        process.stdout.write(content);
      }
    }

    res.end();
    console.log(`\n--- End of Response ---\n`);
  } catch (error: any) {
    console.error("Error calling OpenRouter:", error);
    // If headers are not sent, we can send a 500
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } else {
      // If headers are already sent, we just end the stream
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
