import express, { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
// import { initializeAuth, authRouter } from "./auth.js";
import { initializeAuth, authRouter } from "./authPKCE.js";
import { gmailRouter } from "./gmail-mcp/routes.js";
import { gmailTools } from "./agent/tools.js";
import { executeToolCalls, ToolCall } from "./agent/executor.js";
import { gmailClient } from "./gmail-mcp/client.js";

dotenv.config();

import { OpenRouter } from "@openrouter/sdk";

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// System prompt for the AI agent
const AGENT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to the user's Gmail. You can help users:
- Search and read their emails
- Send new emails or create drafts
- Organize emails (archive, trash, star, mark read/unread)
- Manage Gmail labels

When the user asks about their emails, use the available tools to fetch real data.
Always be helpful and provide clear summaries of email content.
If the user hasn't connected their Gmail, let them know they need to connect it first.
For general questions not related to Gmail, respond directly without using tools.

Important guidelines:
- When listing emails, present them in a clear, readable format
- When reading an email, summarize key points
- Before sending emails, confirm with the user if not explicitly instructed
- Be concise but thorough in your responses`;

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: "http://localhost:5173", // Allow frontend origin
    credentials: true, // Allow cookies
  }),
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
// app.use("/auth", authRouter);

app.use("/gmail-mcp", gmailRouter);

/**
 * API Endpoint: /ask
 * Role: Intelligent agent that can use Gmail tools or respond directly
 */
app.post("/ask", async (req: Request, res: Response) => {
  try {
    const { question, userId } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    // Set headers for streaming response
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    // Check if user has Gmail connected (if userId provided)
    let gmailConnected = false;
    if (userId) {
      try {
        const authStatus = await gmailClient.checkAuthStatus(userId);
        gmailConnected = authStatus.authenticated;
      } catch (e) {
        console.log(
          "[Agent] Gmail auth check failed, proceeding without Gmail tools",
        );
      }
    }

    // Build messages array
    const messages: any[] = [
      {
        role: "system",
        content: gmailConnected
          ? AGENT_SYSTEM_PROMPT
          : AGENT_SYSTEM_PROMPT +
            "\n\nNote: The user has not connected their Gmail account. If they ask about emails, let them know they need to connect Gmail first using the button in the header.",
      },
      {
        role: "user",
        content: question,
      },
    ];

    // Only include tools if Gmail is connected
    const tools = gmailConnected ? gmailTools : undefined;

    console.log(`[Agent] Processing question: "${question}"`);
    console.log(`[Agent] Gmail connected: ${gmailConnected}`);

    // Agentic loop - keep going until we get a final response
    const MAX_ITERATIONS = 10;
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`[Agent] Iteration ${iteration}`);

      // Call the model using OpenRouter SDK (non-streaming for tool use)
      const response = await openrouter.chat.send({
        model: "openai/gpt-oss-20b",
        // model: "openai/gpt-oss-20b",
        // model: "z-ai/glm-4.5-air:free",
        messages,
        tools,
        toolChoice: tools ? "auto" : undefined,
        temperature: 0.4,
        // maxTokens: 2000,
        stream: false,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("No response choice received from model");
      }
      const assistantMessage = choice.message;

      console.log(`[Agent] Finish reason: ${choice.finishReason}`);

      // Check if model wants to use tools
      if (
        choice.finishReason === "tool_calls" &&
        assistantMessage.toolCalls &&
        assistantMessage.toolCalls.length > 0
      ) {
        console.log(
          `[Agent] Tool calls requested: ${assistantMessage.toolCalls.map((tc) => tc.function.name).join(", ")}`,
        );

        // Add assistant message with tool calls to history (convert to snake_case for API)
        messages.push({
          role: "assistant",
          content: assistantMessage.content || null,
          tool_calls: assistantMessage.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });

        // Execute all tool calls
        const toolResults = await executeToolCalls(
          assistantMessage.toolCalls as ToolCall[],
          userId,
        );

        // Add tool results to messages (convert to camelCase for OpenRouter SDK)
        for (const result of toolResults) {
          messages.push({
            role: "tool",
            toolCallId: result.tool_call_id,
            content: result.content,
          });
        }

        // Continue the loop to let the model process tool results
        continue;
      }

      // No more tool calls - write the final response
      if (assistantMessage.content) {
        const content =
          typeof assistantMessage.content === "string"
            ? assistantMessage.content
            : JSON.stringify(assistantMessage.content);
        res.write(content);
        process.stdout.write(content);
      }

      break; // Exit the loop
    }

    if (iteration >= MAX_ITERATIONS) {
      res.write("\n\n[Agent reached maximum iterations]");
    }

    res.end();
    console.log(`\n--- End of Response ---\n`);
  } catch (error: any) {
    console.error("Error in agent:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } else {
      res.write(`\n\nError: ${error.message}`);
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
