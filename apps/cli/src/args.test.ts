import { describe, expect, it } from "vitest";
import { parseOptions, UsageError } from "./args.js";

describe("parseOptions", () => {
  it("has sensible defaults", () => {
    expect(parseOptions([])).toEqual({
      days: 7,
      claudePlan: null,
      codexPlanPriceUsd: null,
      out: null,
      image: true,
      share: false,
      json: false,
      help: false,
    });
  });

  it("parses every option", () => {
    const o = parseOptions(["--days", "30", "--claude-plan", "max20x", "--codex-plan-price", "$100", "--out", "me.png", "--no-image", "--share", "--json"]);
    expect(o).toMatchObject({ days: 30, claudePlan: "max20x", codexPlanPriceUsd: 100, out: "me.png", image: false, share: true, json: true });
  });

  it.each([
    [["--days", "0"]],
    [["--days", "366"]],
    [["--days", "7.5"]],
    [["--days", "abc"]],
    [["--claude-plan", "max100x"]],
    [["--claude-plan", "constructor"]],
    [["--codex-plan-price", "-5"]],
    [["--codex-plan-price", "lots"]],
    [["--out", "receipt.jpg"]],
    [["--nope"]],
    [["positional"]],
  ])("rejects %j with a friendly UsageError", (argv) => {
    expect(() => parseOptions(argv)).toThrow(UsageError);
  });
});
