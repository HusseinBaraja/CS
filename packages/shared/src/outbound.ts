export type OutboundTextSection = string | readonly string[];

export interface RenderOutboundTextInput {
  sections: readonly OutboundTextSection[];
}

const normalizeSectionLines = (section: OutboundTextSection): string[] => {
  const rawLines = (Array.isArray(section) ? section : [section])
    .flatMap((entry) => entry.replace(/\r\n?/g, "\n").split("\n"))
    .map((line) => line.trim());

  let start = 0;
  let end = rawLines.length;

  while (start < end && rawLines[start] === "") {
    start += 1;
  }

  while (end > start && rawLines[end - 1] === "") {
    end -= 1;
  }

  return rawLines.slice(start, end);
};

export const renderOutboundText = (input: RenderOutboundTextInput): string =>
  input.sections
    .map((section) => normalizeSectionLines(section))
    .filter((section) => section.length > 0)
    .map((section) => section.join("\n"))
    .join("\n\n");
