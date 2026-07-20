import { describe, expect, it, vi } from "vitest";

import { createProfileService } from "@/services/profileService";

describe("own profile service", () => {
  it("allowlists safe personal fields and targets only the authenticated user", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "user-1",
        first_name: "Ana",
        last_name: "Reyes",
        role: "resident",
        account_status: "active",
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: vi.fn(() => ({ update })),
    };
    const service = createProfileService(() => client);

    await service.updateOwnProfile({
      first_name: "Ana",
      middle_name: "",
      last_name: "Reyes",
      suffix: "",
      phone_number: "+63 900 000 0000",
      role: "admin",
      account_status: "suspended",
      last_login_at: "2099-01-01",
    });

    expect(update).toHaveBeenCalledWith({
      first_name: "Ana",
      middle_name: null,
      last_name: "Reyes",
      suffix: null,
      phone_number: "+63 900 000 0000",
    });
    expect(eq).toHaveBeenCalledWith("id", "user-1");
  });
});
