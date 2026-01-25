import { Router, Request, Response } from "express";
import { gmailClient } from "./client.js";

const router = Router();

// Helper to get userId from session or request
const getUserId = (req: Request): string | null => {
  // First check session for authenticated user
  const session = req.session as any;
  if (session?.user?.sub) {
    return session.user.sub;
  }
  // Fallback to query param or header (for testing)
  return (
    (req.query.userId as string) || (req.headers["x-user-id"] as string) || null
  );
};

// ============ Health & Status ============

router.get("/health", async (req, res) => {
  try {
    const health = await gmailClient.healthCheck();
    res.json({ ...health, service: "gmail-mcp-proxy" });
  } catch (error: any) {
    res.status(503).json({
      status: "error",
      error: error.message,
      service: "gmail-mcp-proxy",
    });
  }
});

router.get("/status", (req, res) => {
  res.json({
    status: "ok",
    service: "gmail-mcp-proxy",
    mcpUrl: process.env.GMAIL_MCP_URL || "http://localhost:3005",
  });
});

// ============ Gmail OAuth Authentication ============

/**
 * Start Gmail OAuth flow
 * POST /gmail-mcp/auth/start
 * Body: { userId?: string }
 * Returns: { authUrl: string, state: string }
 */
router.post("/auth/start", async (req, res) => {
  try {
    const userId = req.body.userId || getUserId(req);
    console.log("userId", userId);

    if (!userId) {
      return res.status(400).json({
        error:
          "userId is required. Either login first or provide userId in body.",
      });
    }

    const result = await gmailClient.startAuth(userId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail auth start error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Check Gmail authentication status
 * GET /gmail-mcp/auth/status
 * Query: ?userId=xxx (optional if logged in)
 * Returns: { authenticated: boolean, userId: string }
 */
router.get("/auth/status", async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    const result = await gmailClient.checkAuthStatus(userId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail auth status error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Revoke Gmail authentication
 * POST /gmail-mcp/auth/revoke
 * Body: { userId?: string }
 * Returns: { success: boolean }
 */
router.post("/auth/revoke", async (req, res) => {
  try {
    const userId = req.body.userId || getUserId(req);

    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    const result = await gmailClient.revokeAuth(userId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail auth revoke error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Middleware to check Gmail auth ============

const requireGmailAuth = async (
  req: Request,
  res: Response,
  next: Function,
) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Not authenticated. Please login first.",
        code: "NO_USER",
      });
    }

    // Check if user has Gmail connected
    const authStatus = await gmailClient.checkAuthStatus(userId);

    if (!authStatus.authenticated) {
      return res.status(401).json({
        error: "Gmail not connected. Please connect your Gmail account first.",
        code: "GMAIL_NOT_CONNECTED",
      });
    }

    // Attach userId to request for downstream handlers
    (req as any).gmailUserId = userId;
    next();
  } catch (error: any) {
    console.error("Gmail auth check error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============ Email Operations (require Gmail auth) ============

/**
 * List/Search emails
 * GET /gmail-mcp/messages
 * Query: ?q=search_query&count=10
 */
router.get("/messages", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const query = (req.query.q as string) || "";
    const count = req.query.count ? parseInt(req.query.count as string) : 10;

    const result = await gmailClient.searchEmails(userId, query, count);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail messages error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Search emails
 * GET /gmail-mcp/search
 * Query: ?q=search_query&maxResults=10
 */
router.get("/search", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const query = req.query.q as string;
    const maxResults = req.query.maxResults
      ? parseInt(req.query.maxResults as string)
      : 10;

    if (!query) {
      return res.status(400).json({ error: "Missing query parameter 'q'" });
    }

    const result = await gmailClient.searchEmails(userId, query, maxResults);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail search error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Read a specific email
 * GET /gmail-mcp/email/:messageId
 */
router.get("/email/:messageId", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { messageId } = req.params;

    const result = await gmailClient.readEmail(userId, messageId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail read error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send an email
 * POST /gmail-mcp/send
 * Body: { to, subject, body, cc?, bcc?, replyTo?, threadId?, attachments? }
 */
router.post("/send", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { to, subject, body, cc, bcc, replyTo, threadId, attachments } =
      req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        error: "Missing required fields: to, subject, body",
      });
    }

    const result = await gmailClient.sendEmail(userId, {
      to,
      subject,
      body,
      cc,
      bcc,
      replyTo,
      threadId,
      attachments,
    });
    res.json(result);
  } catch (error: any) {
    console.error("Gmail send error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a draft
 * POST /gmail-mcp/draft
 * Body: { to, subject, body, cc?, bcc? }
 */
router.post("/draft", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { to, subject, body, cc, bcc } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        error: "Missing required fields: to, subject, body",
      });
    }

    const result = await gmailClient.createDraft(userId, {
      to,
      subject,
      body,
      cc,
      bcc,
    });
    res.json(result);
  } catch (error: any) {
    console.error("Gmail draft error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Archive an email
 * POST /gmail-mcp/archive/:messageId
 */
router.post("/archive/:messageId", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { messageId } = req.params;

    const result = await gmailClient.archiveEmail(userId, messageId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail archive error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark email as read
 * POST /gmail-mcp/mark-read/:messageId
 */
router.post("/mark-read/:messageId", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { messageId } = req.params;

    const result = await gmailClient.markAsRead(userId, messageId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail mark-read error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark email as unread
 * POST /gmail-mcp/mark-unread/:messageId
 */
router.post("/mark-unread/:messageId", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { messageId } = req.params;

    const result = await gmailClient.markAsUnread(userId, messageId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail mark-unread error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Star an email
 * POST /gmail-mcp/star/:messageId
 */
router.post("/star/:messageId", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { messageId } = req.params;

    const result = await gmailClient.starEmail(userId, messageId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail star error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Trash an email
 * POST /gmail-mcp/trash/:messageId
 */
router.post("/trash/:messageId", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { messageId } = req.params;

    const result = await gmailClient.trashEmail(userId, messageId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail trash error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete an email permanently
 * DELETE /gmail-mcp/email/:messageId
 */
router.delete("/email/:messageId", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { messageId } = req.params;

    const result = await gmailClient.deleteEmail(userId, messageId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Label Operations ============

/**
 * List all labels
 * GET /gmail-mcp/labels
 */
router.get("/labels", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const result = await gmailClient.listLabels(userId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail labels error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a label
 * POST /gmail-mcp/labels
 * Body: { name, messageListVisibility?, labelListVisibility? }
 */
router.post("/labels", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { name, messageListVisibility, labelListVisibility } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const result = await gmailClient.createLabel(userId, name, {
      messageListVisibility,
      labelListVisibility,
    });
    res.json(result);
  } catch (error: any) {
    console.error("Gmail create label error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete a label
 * DELETE /gmail-mcp/labels/:labelId
 */
router.delete("/labels/:labelId", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { labelId } = req.params;

    const result = await gmailClient.deleteLabel(userId, labelId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail delete label error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Filter Operations ============

/**
 * List all filters
 * GET /gmail-mcp/filters
 */
router.get("/filters", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const result = await gmailClient.listFilters(userId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail filters error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a filter
 * POST /gmail-mcp/filters
 * Body: { criteria, action }
 */
router.post("/filters", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { criteria, action } = req.body;

    if (!criteria || !action) {
      return res.status(400).json({
        error: "criteria and action are required",
      });
    }

    const result = await gmailClient.createFilter(userId, criteria, action);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail create filter error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete a filter
 * DELETE /gmail-mcp/filters/:filterId
 */
router.delete("/filters/:filterId", requireGmailAuth, async (req, res) => {
  try {
    const userId = (req as any).gmailUserId;
    const { filterId } = req.params;

    const result = await gmailClient.deleteFilter(userId, filterId);
    res.json(result);
  } catch (error: any) {
    console.error("Gmail delete filter error:", error);
    res.status(500).json({ error: error.message });
  }
});

export const gmailRouter = router;
