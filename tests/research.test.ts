import { describe, it, expect, vi } from "vitest";
import { research } from "../src/worker/research";
import { SocialService } from "../src/worker/service";
import { environment, MemoryBucket, account } from "./helpers";
describe("official research capabilities", () => {
  it("supports business discovery with Facebook Login and labels sources", async () => {
    const service = new SocialService(environment(new MemoryBucket()));
    await service.store.put(`accounts/${account.id}.json`, {
      ...account,
      loginMode: "facebook",
    });
    const call = vi
      .spyOn(service.platforms, "call")
      .mockResolvedValue({ business_discovery: { followers_count: 100 } });
    const result = (await research(service, "analyze_competitor", {
      account_id: account.id,
      username: "public.creator",
      source: "official",
    })) as { source: string; trust: string };
    expect(result.source).toBe("official");
    expect(result.trust).toBe("untrusted_external_data");
    expect(call.mock.calls[0][1]).toContain("business_discovery");
  });
  it("never describes hashtag top media as global trends", async () => {
    const service = new SocialService(environment(new MemoryBucket()));
    await service.store.put(`accounts/${account.id}.json`, {
      ...account,
      loginMode: "facebook",
    });
    vi.spyOn(service.platforms, "call")
      .mockResolvedValueOnce({ data: [{ id: "hashtag-1" }] })
      .mockResolvedValueOnce({ data: [] });
    const result = (await research(service, "get_trending", {
      account_id: account.id,
      hashtag: "matcha",
      source: "official",
    })) as { data: { notice: string } };
    expect(result.data.notice).toContain("bukan daftar tren global");
  });
  it("unavailable permissions return capability errors instead of fabricated results", async () => {
    const service = new SocialService(environment(new MemoryBucket()));
    await service.store.put(`accounts/${account.id}.json`, account);
    await expect(
      research(service, "search_hashtag", {
        account_id: account.id,
        hashtag: "matcha",
        source: "official",
      }),
    ).rejects.toThrow("Facebook Login");
    await expect(
      research(service, "get_public_profile", {
        account_id: account.id,
        username: "creator",
        source: "scrape",
      }),
    ).rejects.toThrow("dinonaktifkan");
  });
  it("rejects field-expansion injection in usernames", async () => {
    const service = new SocialService(environment(new MemoryBucket()));
    await service.store.put(`accounts/${account.id}.json`, {
      ...account,
      loginMode: "facebook",
    });
    await expect(
      research(service, "analyze_competitor", {
        account_id: account.id,
        username: "x){access_token}",
        source: "official",
      }),
    ).rejects.toThrow("Username");
  });
});
