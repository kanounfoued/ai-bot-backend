/**
 * Gmail MCP HTTP Client
 * Connects to the Gmail MCP Server running as a Docker container via HTTP API
 */

const GMAIL_MCP_BASE_URL = process.env.GMAIL_MCP_URL || "http://localhost:3005";

export interface GmailAuthStatus {
  authenticated: boolean;
  userId: string;
}

export interface GmailAuthStartResponse {
  authUrl: string;
  state: string;
}

export interface GmailSearchResult {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
}

export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  isHtml: boolean;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export class GmailMcpHttpClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || GMAIL_MCP_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: any;
      userId?: string;
      params?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const { method = "GET", body, userId, params } = options;

    let url = `${this.baseUrl}${endpoint}`;

    // Add query params
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (userId) {
      headers["X-User-Id"] = userId;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    console.log("data", data);

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Request failed`);
    }

    return data as T;
  }

  // ============ Health Check ============

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request("/health");
  }

  // ============ Authentication ============

  /**
   * Start OAuth flow for a user
   * Returns the auth URL to redirect the user to
   */
  async startAuth(userId: string): Promise<GmailAuthStartResponse> {
    return this.request("/auth/start", {
      method: "POST",
      body: { userId },
    });
  }

  /**
   * Check if a user is authenticated
   */
  async checkAuthStatus(userId: string): Promise<GmailAuthStatus> {
    return this.request("/auth/status", {
      params: { userId },
    });
  }

  /**
   * Revoke authentication for a user
   */
  async revokeAuth(userId: string): Promise<{ success: boolean }> {
    return this.request("/auth/revoke", {
      method: "POST",
      body: { userId },
    });
  }

  // ============ Email Operations ============

  /**
   * Search emails using Gmail query syntax
   */
  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = 10,
  ): Promise<{ messages: GmailSearchResult[] }> {
    return this.request("/gmail/search", {
      userId,
      params: { query, maxResults: maxResults.toString() },
    });
  }

  /**
   * Read a specific email by ID
   */
  async readEmail(userId: string, messageId: string): Promise<GmailEmail> {
    return this.request("/gmail/read", {
      userId,
      params: { messageId },
    });
  }

  /**
   * Send an email
   */
  async sendEmail(
    userId: string,
    options: {
      to: string;
      subject: string;
      body: string;
      cc?: string;
      bcc?: string;
      replyTo?: string;
      threadId?: string;
      attachments?: Array<{
        filename: string;
        content: string; // base64 encoded
        mimeType: string;
      }>;
    },
  ): Promise<{ success: boolean; messageId: string }> {
    return this.request("/gmail/send", {
      method: "POST",
      userId,
      body: options,
    });
  }

  /**
   * Create a draft email
   */
  async createDraft(
    userId: string,
    options: {
      to: string;
      subject: string;
      body: string;
      cc?: string;
      bcc?: string;
    },
  ): Promise<{ success: boolean; draftId: string }> {
    return this.request("/gmail/draft", {
      method: "POST",
      userId,
      body: options,
    });
  }

  /**
   * Modify email labels (archive, mark read/unread, etc.)
   */
  async modifyEmail(
    userId: string,
    messageId: string,
    options: {
      addLabelIds?: string[];
      removeLabelIds?: string[];
    },
  ): Promise<{ success: boolean }> {
    return this.request("/gmail/modify", {
      method: "POST",
      userId,
      body: { messageId, ...options },
    });
  }

  /**
   * Delete an email permanently
   */
  async deleteEmail(
    userId: string,
    messageId: string,
  ): Promise<{ success: boolean }> {
    return this.request(`/gmail/delete`, {
      method: "DELETE",
      userId,
      params: { messageId },
    });
  }

  // ============ Label Operations ============

  /**
   * List all labels
   */
  async listLabels(userId: string): Promise<{ labels: GmailLabel[] }> {
    return this.request("/gmail/labels", { userId });
  }

  /**
   * Create a new label
   */
  async createLabel(
    userId: string,
    name: string,
    options?: {
      messageListVisibility?: "show" | "hide";
      labelListVisibility?: "labelShow" | "labelShowIfUnread" | "labelHide";
    },
  ): Promise<GmailLabel> {
    return this.request("/gmail/labels", {
      method: "POST",
      userId,
      body: { name, ...options },
    });
  }

  /**
   * Delete a label
   */
  async deleteLabel(
    userId: string,
    labelId: string,
  ): Promise<{ success: boolean }> {
    return this.request(`/gmail/labels/${labelId}`, {
      method: "DELETE",
      userId,
    });
  }

  // ============ Filter Operations ============

  /**
   * List all filters
   */
  async listFilters(userId: string): Promise<{ filters: any[] }> {
    return this.request("/gmail/filters", { userId });
  }

  /**
   * Create a filter
   */
  async createFilter(
    userId: string,
    criteria: {
      from?: string;
      to?: string;
      subject?: string;
      query?: string;
      hasAttachment?: boolean;
    },
    action: {
      addLabelIds?: string[];
      removeLabelIds?: string[];
      forward?: string;
    },
  ): Promise<any> {
    return this.request("/gmail/filters", {
      method: "POST",
      userId,
      body: { criteria, action },
    });
  }

  /**
   * Delete a filter
   */
  async deleteFilter(
    userId: string,
    filterId: string,
  ): Promise<{ success: boolean }> {
    return this.request(`/gmail/filters/${filterId}`, {
      method: "DELETE",
      userId,
    });
  }

  // ============ Convenience Methods ============

  /**
   * List recent messages (convenience wrapper for search)
   */
  async listMessages(
    userId: string,
    count: number = 10,
  ): Promise<{ messages: GmailSearchResult[] }> {
    return this.searchEmails(userId, "", count);
  }

  /**
   * Archive an email (remove INBOX label)
   */
  async archiveEmail(
    userId: string,
    messageId: string,
  ): Promise<{ success: boolean }> {
    return this.modifyEmail(userId, messageId, {
      removeLabelIds: ["INBOX"],
    });
  }

  /**
   * Mark email as read
   */
  async markAsRead(
    userId: string,
    messageId: string,
  ): Promise<{ success: boolean }> {
    return this.modifyEmail(userId, messageId, {
      removeLabelIds: ["UNREAD"],
    });
  }

  /**
   * Mark email as unread
   */
  async markAsUnread(
    userId: string,
    messageId: string,
  ): Promise<{ success: boolean }> {
    return this.modifyEmail(userId, messageId, {
      addLabelIds: ["UNREAD"],
    });
  }

  /**
   * Star an email
   */
  async starEmail(
    userId: string,
    messageId: string,
  ): Promise<{ success: boolean }> {
    return this.modifyEmail(userId, messageId, {
      addLabelIds: ["STARRED"],
    });
  }

  /**
   * Unstar an email
   */
  async unstarEmail(
    userId: string,
    messageId: string,
  ): Promise<{ success: boolean }> {
    return this.modifyEmail(userId, messageId, {
      removeLabelIds: ["STARRED"],
    });
  }

  /**
   * Move to trash
   */
  async trashEmail(
    userId: string,
    messageId: string,
  ): Promise<{ success: boolean }> {
    return this.modifyEmail(userId, messageId, {
      addLabelIds: ["TRASH"],
      removeLabelIds: ["INBOX"],
    });
  }
}

// Export singleton instance
export const gmailClient = new GmailMcpHttpClient();
