// Shared by everything that sends a conversation to the team (issue reports and notes).
// These limits mirror what the API enforces, so a tester never submits something the
// server will reject.
export const MAX_MESSAGES = 200;
export const MAX_MESSAGE_CHARS = 20000;

// The tester's chat as the API expects it: the latest messages, oldest first.
export const buildTranscript = (messages) =>
  (messages || []).slice(-MAX_MESSAGES).map((message) => ({
    id: String(message.id),
    role: message.role === "user" ? "user" : "agent",
    text: String(message.text || "").slice(0, MAX_MESSAGE_CHARS),
    created_at: (message.createdAt instanceof Date ? message.createdAt : new Date()).toISOString(),
  }));

// One key per submit attempt. If the same attempt is repeated (double click, retry), the
// API returns the report it already saved instead of creating a second one.
export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `submit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
