import { describe, expect, it } from "vitest";
import { displayRequestStatus, isDisplayStatus } from "@/lib/requests/status";

const s = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe("statut affiché d'une demande", () => {
  it("brouillon, puis envoyé tant que personne n'a ouvert", () => {
    expect(displayRequestStatus("draft", s("pending", "pending"))).toBe("draft");
    expect(displayRequestStatus("pending", s("sent", "pending"))).toBe("sent");
    expect(displayRequestStatus("pending", s("sent", "sent"))).toBe("sent");
  });

  it("vu dès qu'un signataire a ouvert le document", () => {
    expect(displayRequestStatus("pending", s("opened", "pending"))).toBe("viewed");
  });

  it("en attente dès qu'une partie a signé", () => {
    expect(displayRequestStatus("pending", s("signed", "sent"))).toBe("waiting");
    expect(displayRequestStatus("pending", s("signed", "opened"))).toBe("waiting");
  });

  it("statuts finaux", () => {
    expect(displayRequestStatus("completed", s("signed", "signed"))).toBe("signed");
    expect(displayRequestStatus("declined", s("signed", "declined"))).toBe("declined");
    expect(displayRequestStatus("expired", s("expired"))).toBe("expired");
    expect(displayRequestStatus("canceled", s("sent"))).toBe("canceled");
  });

  it("reconnaît les statuts du filtre", () => {
    expect(isDisplayStatus("waiting")).toBe(true);
    expect(isDisplayStatus("pending")).toBe(false);
    expect(isDisplayStatus(undefined)).toBe(false);
  });
});
