import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTapologyFighterProfile, tapologyProfileHref } from "./tapology";

describe("tapology fighter links", () => {
  it("keeps a profile URL that includes the numeric fighter id", () => {
    const href = tapologyProfileHref({
      name: "Aaron Pico",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/86018-aaron-pico",
    });
    assert.equal(href, "https://www.tapology.com/fightcenter/fighters/86018-aaron-pico");
    assert.equal(isTapologyFighterProfile(href), true);
  });

  it("replaces a slug-only fighter URL with a Tapology search", () => {
    const href = tapologyProfileHref({
      name: "Aaron Pico",
      tapologyUrl: "https://www.tapology.com/fightcenter/fighters/aaron-pico",
    });
    assert.equal(
      href,
      "https://www.tapology.com/search?term=Aaron%20Pico&search=Submit&mainSearchFilter=fighters",
    );
    assert.equal(isTapologyFighterProfile(href), false);
    assert.equal(href.includes("/fightcenter"), false);
  });

  it("searches when the stored URL is missing, unsafe, or not a fighter profile", () => {
    const missing = tapologyProfileHref({ name: "José Aldo", tapologyUrl: null });
    assert.equal(
      missing,
      "https://www.tapology.com/search?term=Jos%C3%A9%20Aldo&search=Submit&mainSearchFilter=fighters",
    );
    const bare = tapologyProfileHref({
      name: "Aaron Pico",
      tapologyUrl: "https://www.tapology.com/fightcenter",
    });
    const script = tapologyProfileHref({ name: "Aaron Pico", tapologyUrl: "javascript:alert(1)" });
    assert.equal(bare, script);
    assert.equal(bare.includes("/fightcenter"), false);
  });
});
