/**
 * Gmail Tools Definition for LLM Agent
 * These tools can be used by the AI model to interact with Gmail
 */

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export const gmailTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_emails",
      description:
        "Search for emails in the user's Gmail inbox. Use Gmail query syntax (e.g., 'from:someone@example.com', 'subject:hello', 'is:unread', 'newer_than:7d'). Leave query empty to get recent emails.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Gmail search query. Examples: 'from:john@example.com', 'subject:meeting', 'is:unread', 'has:attachment', or empty for recent emails",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of emails to return (default: 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_email",
      description:
        "Read the full content of a specific email by its message ID. Use this after searching to get the complete email body.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The unique message ID of the email to read",
          },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description:
        "Send a new email. Requires recipient, subject, and body. Can optionally include CC, BCC, and reply to a thread.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body content (plain text)",
          },
          cc: {
            type: "string",
            description: "CC recipients (comma-separated)",
          },
          bcc: {
            type: "string",
            description: "BCC recipients (comma-separated)",
          },
          threadId: {
            type: "string",
            description: "Thread ID to reply to an existing conversation",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_draft",
      description:
        "Create a draft email without sending it. The user can review and send it later.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body content",
          },
          cc: {
            type: "string",
            description: "CC recipients (comma-separated)",
          },
          bcc: {
            type: "string",
            description: "BCC recipients (comma-separated)",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_email",
      description:
        "Archive an email (removes it from inbox but keeps it in All Mail)",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The message ID of the email to archive",
          },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trash_email",
      description: "Move an email to trash",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The message ID of the email to trash",
          },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_as_read",
      description: "Mark an email as read",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The message ID of the email to mark as read",
          },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_as_unread",
      description: "Mark an email as unread",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The message ID of the email to mark as unread",
          },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "star_email",
      description: "Add a star to an email",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The message ID of the email to star",
          },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_labels",
      description:
        "Get all Gmail labels/folders for the user (like Inbox, Sent, custom labels)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_label",
      description: "Create a new Gmail label/folder",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the new label",
          },
        },
        required: ["name"],
      },
    },
  },
];

// Tool names that require Gmail authentication
export const gmailToolNames = gmailTools.map((t) => t.function.name);
