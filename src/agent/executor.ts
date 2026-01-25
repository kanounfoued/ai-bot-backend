/**
 * Tool Executor for Gmail Agent
 * Executes tool calls made by the LLM
 */

import { gmailClient } from "../gmail-mcp/client.js";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

/**
 * Execute a tool call and return the result
 */
export async function executeToolCall(
  toolCall: ToolCall,
  userId: string
): Promise<ToolResult> {
  const { name, arguments: argsString } = toolCall.function;

  let args: Record<string, any>;
  try {
    args = JSON.parse(argsString);
  } catch (e) {
    return {
      tool_call_id: toolCall.id,
      role: "tool",
      content: JSON.stringify({ error: "Invalid JSON arguments" }),
    };
  }

  console.log(`[Agent] Executing tool: ${name}`, args);

  try {
    let result: any;

    switch (name) {
      case "search_emails": {
        const query = args.query || "";
        const maxResults = args.maxResults || 10;
        result = await gmailClient.searchEmails(userId, query, maxResults);
        break;
      }

      case "read_email": {
        result = await gmailClient.readEmail(userId, args.messageId);
        break;
      }

      case "send_email": {
        result = await gmailClient.sendEmail(userId, {
          to: args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
          threadId: args.threadId,
        });
        break;
      }

      case "create_draft": {
        result = await gmailClient.createDraft(userId, {
          to: args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
        });
        break;
      }

      case "archive_email": {
        result = await gmailClient.archiveEmail(userId, args.messageId);
        break;
      }

      case "trash_email": {
        result = await gmailClient.trashEmail(userId, args.messageId);
        break;
      }

      case "mark_as_read": {
        result = await gmailClient.markAsRead(userId, args.messageId);
        break;
      }

      case "mark_as_unread": {
        result = await gmailClient.markAsUnread(userId, args.messageId);
        break;
      }

      case "star_email": {
        result = await gmailClient.starEmail(userId, args.messageId);
        break;
      }

      case "list_labels": {
        result = await gmailClient.listLabels(userId);
        break;
      }

      case "create_label": {
        result = await gmailClient.createLabel(userId, args.name);
        break;
      }

      default:
        result = { error: `Unknown tool: ${name}` };
    }

    console.log(`[Agent] Tool ${name} result:`, result);

    return {
      tool_call_id: toolCall.id,
      role: "tool",
      content: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error(`[Agent] Tool ${name} error:`, error);
    return {
      tool_call_id: toolCall.id,
      role: "tool",
      content: JSON.stringify({ error: error.message }),
    };
  }
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  userId: string
): Promise<ToolResult[]> {
  return Promise.all(toolCalls.map((tc) => executeToolCall(tc, userId)));
}
