/**
 * Tests for tickets domain handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock functions using vi.hoisted
const {
  mockTicketsList,
  mockTicketsGet,
  mockTicketsCreate,
  mockTicketsUpdate,
  mockTicketsAddComment,
  mockTicketsGetComments,
  mockTicketsListBoards,
  mockClient,
} = vi.hoisted(() => {
  const mockTicketsList = vi.fn();
  const mockTicketsGet = vi.fn();
  const mockTicketsCreate = vi.fn();
  const mockTicketsUpdate = vi.fn();
  const mockTicketsAddComment = vi.fn();
  const mockTicketsGetComments = vi.fn();
  const mockTicketsListBoards = vi.fn();

  const mockClient = {
    tickets: {
      list: mockTicketsList,
      get: mockTicketsGet,
      create: mockTicketsCreate,
      update: mockTicketsUpdate,
      addComment: mockTicketsAddComment,
      getComments: mockTicketsGetComments,
      listBoards: mockTicketsListBoards,
    },
  };

  return {
    mockTicketsList,
    mockTicketsGet,
    mockTicketsCreate,
    mockTicketsUpdate,
    mockTicketsAddComment,
    mockTicketsGetComments,
    mockTicketsListBoards,
    mockClient,
  };
});

// Mock the client module before importing the handler
vi.mock("../../utils/client.js", () => ({
  getClient: () => Promise.resolve(mockClient),
  clearClient: vi.fn(),
  getCredentials: () => ({
    clientId: "test",
    clientSecret: "test",
    region: "us",
    baseUrl: "https://app.ninjarmm.com",
  }),
}));

// Mirror the real SDK's error shape (statusCode, not status — see
// @wyre-technology/node-ninjaone src/errors.ts) so this test actually
// exercises the `instanceof` check in the handler instead of a shape that
// only the test believes in.
const { NinjaOneNotFoundError } = vi.hoisted(() => {
  class NinjaOneNotFoundError extends Error {
    readonly statusCode = 404;
    readonly response: unknown;
    constructor(message: string, response?: unknown) {
      super(message);
      this.name = "NinjaOneNotFoundError";
      this.response = response;
      Object.setPrototypeOf(this, NinjaOneNotFoundError.prototype);
    }
  }
  return { NinjaOneNotFoundError };
});

vi.mock("@wyre-technology/node-ninjaone", () => ({
  NinjaOneNotFoundError,
}));

// Import handler after mocking
import { ticketsHandler } from "../../domains/tickets.js";

describe("Tickets Domain Handler", () => {
  beforeEach(() => {
    // Clear call history
    mockTicketsList.mockClear();
    mockTicketsGet.mockClear();
    mockTicketsCreate.mockClear();
    mockTicketsUpdate.mockClear();
    mockTicketsAddComment.mockClear();
    mockTicketsGetComments.mockClear();

    // Reset mock implementations - list returns TicketListResponse
    mockTicketsList.mockResolvedValue({
      tickets: [
        { id: 1, subject: "Ticket 1", status: "OPEN" },
        { id: 2, subject: "Ticket 2", status: "IN_PROGRESS" },
      ],
      cursor: "next-page",
    });
    mockTicketsGet.mockResolvedValue({
      id: 1,
      subject: "Ticket 1",
      description: "Test ticket",
      status: "OPEN",
    });
    mockTicketsCreate.mockResolvedValue({
      id: 100,
      subject: "New Ticket",
      status: "OPEN",
    });
    mockTicketsUpdate.mockResolvedValue({
      id: 1,
      subject: "Updated Ticket",
      status: "IN_PROGRESS",
    });
    mockTicketsAddComment.mockResolvedValue({
      id: 50,
      ticketId: 1,
      body: "Test comment",
    });
    mockTicketsGetComments.mockResolvedValue([
      { id: 1, body: "Comment 1" },
      { id: 2, body: "Comment 2" },
    ]);
    mockTicketsListBoards.mockResolvedValue([
      { id: 1, name: "All Tickets" },
      { id: 2, name: "Service Desk" },
    ]);
  });

  describe("getTools", () => {
    it("should return all ticket tools", () => {
      const tools = ticketsHandler.getTools();

      expect(tools.length).toBe(8);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("ninjaone_tickets_list");
      expect(toolNames).toContain("ninjaone_tickets_get");
      expect(toolNames).toContain("ninjaone_tickets_create");
      expect(toolNames).toContain("ninjaone_tickets_update");
      expect(toolNames).toContain("ninjaone_tickets_add_comment");
      expect(toolNames).toContain("ninjaone_tickets_comments");
      expect(toolNames).toContain("ninjaone_tickets_boards_list");
      expect(toolNames).toContain("ninjaone_tickets_comment_search");
    });

    it("ninjaone_tickets_list should require board_id", () => {
      const tools = ticketsHandler.getTools();
      const listTool = tools.find((t) => t.name === "ninjaone_tickets_list");

      expect(listTool).toBeDefined();
      expect(listTool?.inputSchema.required).toContain("board_id");
    });

    it("ninjaone_tickets_get should require ticket_id", () => {
      const tools = ticketsHandler.getTools();
      const getTool = tools.find((t) => t.name === "ninjaone_tickets_get");

      expect(getTool).toBeDefined();
      expect(getTool?.inputSchema.required).toContain("ticket_id");
    });

    it("ninjaone_tickets_create should require subject and organization_id", () => {
      const tools = ticketsHandler.getTools();
      const createTool = tools.find((t) => t.name === "ninjaone_tickets_create");

      expect(createTool).toBeDefined();
      expect(createTool?.inputSchema.required).toContain("subject");
      expect(createTool?.inputSchema.required).toContain("organization_id");
    });

    it("ninjaone_tickets_add_comment should require ticket_id and body", () => {
      const tools = ticketsHandler.getTools();
      const commentTool = tools.find((t) => t.name === "ninjaone_tickets_add_comment");

      expect(commentTool).toBeDefined();
      expect(commentTool?.inputSchema.required).toContain("ticket_id");
      expect(commentTool?.inputSchema.required).toContain("body");
    });
  });

  describe("handleCall", () => {
    describe("ninjaone_tickets_list", () => {
      it("should list tickets for an explicit board", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_list", {
          board_id: 2,
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].type).toBe("text");
        expect(mockTicketsList).toHaveBeenCalledWith(
          expect.objectContaining({ boardId: 2 })
        );

        const data = JSON.parse(result.content[0].text);
        expect(data.tickets).toHaveLength(2);
        expect(data.cursor).toBe("next-page");
      });

      it("should return an actionable error when board_id is omitted", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_list", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("board_id");
        expect(result.content[0].text).toContain("ninjaone_tickets_boards_list");
        expect(mockTicketsList).not.toHaveBeenCalled();
      });

      it("should NOT send status/org/device filters to the board API (#60, #61)", async () => {
        // NinjaOne's board-run endpoint 400s on these filters, so the handler must
        // never forward them — it fetches the board page and filters client-side.
        await ticketsHandler.handleCall("ninjaone_tickets_list", {
          board_id: 1,
          status: "OPEN",
          organization_id: 5,
          device_id: 10,
          limit: 25,
        });

        expect(mockTicketsList).toHaveBeenCalledWith({
          boardId: 1,
          pageSize: 25,
          lastCursorId: undefined,
        });
        const passed = mockTicketsList.mock.calls[0][0];
        expect(passed).not.toHaveProperty("status");
        expect(passed).not.toHaveProperty("organizationId");
        expect(passed).not.toHaveProperty("deviceId");
      });

      it("should filter tickets by status client-side (board-row status object)", async () => {
        mockTicketsList.mockResolvedValueOnce({
          data: [
            { id: 1, status: { statusId: 2000, displayName: "Open" }, clientId: 5, nodeId: 10 },
            { id: 2, status: { statusId: 4000, displayName: "In Progress" }, clientId: 5, nodeId: 11 },
            { id: 3, status: { statusId: 2000, displayName: "Open" }, clientId: 7, nodeId: 12 },
          ],
        });

        const result = await ticketsHandler.handleCall("ninjaone_tickets_list", {
          board_id: 1,
          status: "OPEN",
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.count).toBe(2);
        expect(data.scanned).toBe(3);
        expect(data.tickets.map((t: { id: number }) => t.id)).toEqual([1, 3]);
        expect(data.note).toContain("client-side");
      });

      it("should match status enum against the display name (IN_PROGRESS → 'In Progress')", async () => {
        mockTicketsList.mockResolvedValueOnce({
          data: [
            { id: 1, status: { statusId: 2000, displayName: "Open" } },
            { id: 2, status: { statusId: 4000, displayName: "In Progress" } },
          ],
        });

        const result = await ticketsHandler.handleCall("ninjaone_tickets_list", {
          board_id: 1,
          status: "IN_PROGRESS",
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.tickets.map((t: { id: number }) => t.id)).toEqual([2]);
      });

      it("should filter by organization (clientId) and device (nodeId) client-side", async () => {
        mockTicketsList.mockResolvedValueOnce({
          data: [
            { id: 1, status: { displayName: "Open" }, clientId: 5, nodeId: 10 },
            { id: 2, status: { displayName: "Open" }, clientId: 5, nodeId: 99 },
            { id: 3, status: { displayName: "Open" }, clientId: 7, nodeId: 10 },
          ],
        });

        const result = await ticketsHandler.handleCall("ninjaone_tickets_list", {
          board_id: 1,
          organization_id: 5,
          device_id: 10,
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.tickets.map((t: { id: number }) => t.id)).toEqual([1]);
      });

      it("should flag hasMore and a cursor when the board page is full", async () => {
        // A full page (length === limit) means the board has more tickets.
        mockTicketsList.mockResolvedValueOnce({
          data: [
            { id: 10, status: { displayName: "Open" }, clientId: 5 },
            { id: 20, status: { displayName: "Closed" }, clientId: 5 },
          ],
        });

        const result = await ticketsHandler.handleCall("ninjaone_tickets_list", {
          board_id: 1,
          status: "OPEN",
          limit: 2,
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.count).toBe(1); // only the Open one matched...
        expect(data.scanned).toBe(2); // ...out of 2 scanned
        expect(data.hasMore).toBe(true); // full page → more tickets exist
        expect(data.cursor).toBe("20"); // resume after the max row id
      });

      it("should forward cursor as lastCursorId for pagination", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_list", {
          board_id: 2,
          limit: 50,
          cursor: "50",
        });

        expect(mockTicketsList).toHaveBeenCalledWith(
          expect.objectContaining({ lastCursorId: 50, pageSize: 50, boardId: 2 })
        );
      });
    });

    describe("ninjaone_tickets_get", () => {
      it("should get a single ticket", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_get", {
          ticket_id: 1,
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.id).toBe(1);
        expect(data.subject).toBe("Ticket 1");
      });
    });

    describe("ninjaone_tickets_create", () => {
      it("should create a ticket", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_create", {
          subject: "New Ticket",
          description: "Test description",
          organization_id: 1,
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.id).toBe(100);
        expect(data.subject).toBe("New Ticket");
      });

      it("should pass all fields to API", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_create", {
          subject: "New Ticket",
          description: "Test description",
          organization_id: 1,
          device_id: 5,
          priority: "HIGH",
          type: "INCIDENT",
        });

        expect(mockTicketsCreate).toHaveBeenCalledWith({
          subject: "New Ticket",
          description: "Test description",
          organizationId: 1,
          deviceId: 5,
          priority: "HIGH",
          type: "INCIDENT",
        });
      });
    });

    describe("ninjaone_tickets_update", () => {
      it("should update a ticket", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_update", {
          ticket_id: 1,
          subject: "Updated Ticket",
          status: "IN_PROGRESS",
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.subject).toBe("Updated Ticket");
        expect(data.status).toBe("IN_PROGRESS");
      });
    });

    describe("ninjaone_tickets_add_comment", () => {
      it("should add a comment to a ticket", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_add_comment", {
          ticket_id: 1,
          body: "Test comment",
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data.ticketId).toBe(1);
        expect(data.body).toBe("Test comment");
      });

      it("should set internal flag when public is false", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_add_comment", {
          ticket_id: 1,
          body: "Private comment",
          public: false,
        });

        expect(mockTicketsAddComment).toHaveBeenCalledWith(1, {
          body: "Private comment",
          internal: true,
        });
      });
    });

    describe("ninjaone_tickets_comments", () => {
      it("should get ticket comments", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_comments", {
          ticket_id: 1,
        });

        expect(result.isError).toBeUndefined();

        const data = JSON.parse(result.content[0].text);
        expect(data).toHaveLength(2);
      });
    });

    describe("ninjaone_tickets_boards_list", () => {
      it("should list available boards", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_boards_list", {});

        expect(result.isError).toBeUndefined();
        expect(mockTicketsListBoards).toHaveBeenCalledWith();

        const data = JSON.parse(result.content[0].text);
        expect(data).toHaveLength(2);
        expect(data[0]).toEqual({ id: 1, name: "All Tickets" });
      });

      it("should return actionable guidance when the boards endpoint 404s", async () => {
        const notFound = new NinjaOneNotFoundError("Resource not found", {
          resultCode: "FAILURE",
          errorMessage: "HTTP 404 Not Found",
        });
        mockTicketsListBoards.mockRejectedValueOnce(notFound);

        const result = await ticketsHandler.handleCall("ninjaone_tickets_boards_list", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("404");
        expect(result.content[0].text).toContain("web UI");
      });
    });

    describe("ninjaone_tickets_comment_search", () => {
      it("should require board_id", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_comment_search", {
          since: "2026-01-01T00:00:00Z",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("board_id");
      });

      it("should require a parseable since", async () => {
        const missing = await ticketsHandler.handleCall("ninjaone_tickets_comment_search", {
          board_id: 1006,
        });
        expect(missing.isError).toBe(true);
        expect(missing.content[0].text).toContain("since");

        const unparseable = await ticketsHandler.handleCall("ninjaone_tickets_comment_search", {
          board_id: 1006,
          since: "not-a-date",
        });
        expect(unparseable.isError).toBe(true);
        expect(unparseable.content[0].text).toContain("since");
      });

      it("should only fetch comments for candidates updated on/after since, and match on comment timestamp within the window", async () => {
        mockTicketsList.mockResolvedValueOnce({
          data: [
            // Candidate: updated after `since`, has a comment inside the window → matched
            {
              id: 1,
              status: { displayName: "Closed" },
              lastUpdated: "2026-01-10T00:00:00Z",
            },
            // Candidate: updated after `since`, but no comment falls inside the window → not matched
            {
              id: 2,
              status: { displayName: "Closed" },
              lastUpdated: "2026-01-11T00:00:00Z",
            },
            // Not a candidate: untouched since before `since` → getComments must not be called
            {
              id: 3,
              status: { displayName: "Closed" },
              lastUpdated: "2025-01-01T00:00:00Z",
            },
            // Filtered out entirely: wrong status
            {
              id: 4,
              status: { displayName: "Open" },
              lastUpdated: "2026-01-12T00:00:00Z",
            },
          ],
        });

        mockTicketsGetComments.mockResolvedValueOnce([
          { id: 100, body: "in window", createTime: "2026-01-10T12:00:00Z" },
        ]);
        mockTicketsGetComments.mockResolvedValueOnce([
          { id: 101, body: "before window", createTime: "2025-06-01T00:00:00Z" },
        ]);

        const result = await ticketsHandler.handleCall("ninjaone_tickets_comment_search", {
          board_id: 1006,
          status: "CLOSED",
          since: "2026-01-01T00:00:00Z",
          until: "2026-01-31T00:00:00Z",
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);

        expect(data.ticketsScanned).toBe(4);
        expect(data.candidatesChecked).toBe(2);
        expect(mockTicketsGetComments).toHaveBeenCalledTimes(2);
        expect(mockTicketsGetComments).toHaveBeenNthCalledWith(1, 1, "COMMENT");
        expect(mockTicketsGetComments).toHaveBeenNthCalledWith(2, 2, "COMMENT");

        expect(data.count).toBe(1);
        expect(data.tickets[0].id).toBe(1);
        expect(data.tickets[0].matchingComments).toHaveLength(1);
        expect(data.scanCapped).toBe(false);
        expect(data.commentLookupsCapped).toBe(false);
      });

      it("should page through the board until exhausted, accumulating scanned count across pages", async () => {
        const fullPage = Array.from({ length: 50 }, (_, i) => ({
          id: i + 1,
          status: { displayName: "Closed" },
          lastUpdated: "2026-01-10T00:00:00Z",
        }));
        const lastPage = [
          { id: 51, status: { displayName: "Closed" }, lastUpdated: "2026-01-10T00:00:00Z" },
        ];
        mockTicketsList.mockResolvedValueOnce({ data: fullPage });
        mockTicketsList.mockResolvedValueOnce({ data: lastPage });
        mockTicketsGetComments.mockResolvedValue([]);

        const result = await ticketsHandler.handleCall("ninjaone_tickets_comment_search", {
          board_id: 1006,
          status: "CLOSED",
          since: "2026-01-01T00:00:00Z",
        });

        const data = JSON.parse(result.content[0].text);
        expect(mockTicketsList).toHaveBeenCalledTimes(2);
        expect(mockTicketsList).toHaveBeenNthCalledWith(2, {
          boardId: 1006,
          pageSize: 50,
          lastCursorId: 50,
        });
        expect(data.ticketsScanned).toBe(51);
        expect(data.scanCapped).toBe(false);
      });

      it("should cap scanning at max_tickets_scanned and return a resumable cursor", async () => {
        const fullPage = Array.from({ length: 50 }, (_, i) => ({
          id: i + 1,
          status: { displayName: "Closed" },
          lastUpdated: "2026-01-10T00:00:00Z",
        }));
        mockTicketsList.mockResolvedValueOnce({ data: fullPage });
        mockTicketsGetComments.mockResolvedValue([]);

        const result = await ticketsHandler.handleCall("ninjaone_tickets_comment_search", {
          board_id: 1006,
          since: "2026-01-01T00:00:00Z",
          max_tickets_scanned: 50,
        });

        const data = JSON.parse(result.content[0].text);
        expect(mockTicketsList).toHaveBeenCalledTimes(1);
        expect(data.scanCapped).toBe(true);
        expect(data.cursor).toBe("50");
      });
    });

    describe("unknown tool", () => {
      it("should return error for unknown tool", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_unknown", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown ticket tool");
      });
    });
  });
});
