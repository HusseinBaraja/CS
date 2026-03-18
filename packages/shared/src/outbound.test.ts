import { describe, expect, test } from 'bun:test';
import { renderOutboundText } from './outbound';

describe("renderOutboundText", () => {
  test("joins trimmed sections with exactly one blank line", () => {
    expect(renderOutboundText({
      sections: [
        "  Hello\r\nworld  ",
        ["  Price: 10  ", "  In stock  "],
        "  Thanks  ",
      ],
    })).toBe("Hello\nworld\n\nPrice: 10\nIn stock\n\nThanks");
  });

  test("drops empty sections and empty leading or trailing lines", () => {
    expect(renderOutboundText({
      sections: [
        "\n \r\n",
        "\n  First line  \n  Second line  \n",
        ["", "   ", "\n"],
        "\n  Final line  \n",
      ],
    })).toBe("First line\nSecond line\n\nFinal line");
  });

  test("preserves intentional interior blank lines inside a section", () => {
    expect(renderOutboundText({
      sections: [
        ["Title", " ", "Detail"],
      ],
    })).toBe("Title\n\nDetail");
  });

  test("preserves Arabic and English text while trimming per-line whitespace", () => {
    expect(renderOutboundText({
      sections: [
        "  عندنا علب برغر  ",
        "  Burger boxes available  ",
      ],
    })).toBe("عندنا علب برغر\n\nBurger boxes available");
  });

  test("returns an empty string when all sections are empty", () => {
    expect(renderOutboundText({
      sections: [
        "",
        [" ", "\n"],
      ],
    })).toBe("");
  });
});
