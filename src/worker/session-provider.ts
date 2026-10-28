/** Interface provider: hanya sesi manusia; tidak menyediakan operasi publik TikTok. */
export interface ConnectedSessionProvider {
  assertConfigured(): void;
  createLogin(profileId: string, metadata: Record<string, string>): Promise<{ id: string; liveUrl: string; timeoutAt: string }>;
  browser(id: string): Promise<{ id: string; status: "active" | "stopped"; metadata?: Record<string, string> }>;
  stopBrowser(id: string): Promise<void>;
}
