import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.server", () => ({
  serverEnv: { GOTENBERG_URL: "http://gotenberg.test", GOTENBERG_TOKEN: "secret" },
}));
const { gotenbergConverter, ConversionError } = await import("@/lib/documents/convert");

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

afterEach(() => vi.unstubAllGlobals());

describe("conversion Word → PDF (Gotenberg)", () => {
  it("réessaie une fois quand LibreOffice redémarre (503)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("context deadline exceeded", { status: 503 }))
      .mockResolvedValueOnce(new Response(pdf, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await gotenbergConverter.toPdf(new Uint8Array([1, 2, 3]), "docx");
    expect(Array.from(out)).toEqual(Array.from(pdf));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("quicksign:secret").toString("base64")}`,
    });
  });

  it("ne réessaie pas indéfiniment, ni sur une autre erreur", async () => {
    const twice503 = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", twice503);
    await expect(gotenbergConverter.toPdf(new Uint8Array([1]), "docx")).rejects.toBeInstanceOf(
      ConversionError,
    );
    expect(twice503).toHaveBeenCalledTimes(2);

    const bad = vi.fn().mockResolvedValue(new Response("bad file", { status: 400 }));
    vi.stubGlobal("fetch", bad);
    await expect(gotenbergConverter.toPdf(new Uint8Array([1]), "docx")).rejects.toMatchObject({
      code: "failed",
    });
    expect(bad).toHaveBeenCalledTimes(1);
  });
});
