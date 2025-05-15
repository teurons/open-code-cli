import { extractCodeFromResponse } from "./ai-utils";

describe("extractCodeFromResponse", () => {
  test("should extract code from a markdown code block", () => {
    const input = "Here is the code:\n```typescript\nconst x = 1;\n```";
    const expected = "const x = 1;";
    expect(extractCodeFromResponse(input)).toBe(expected);
  });

  test("should extract and join multiple code blocks", () => {
    const input =
      "First block:\n```typescript\nconst x = 1;\n```\nSecond block:\n```typescript\nconst y = 2;\n```";
    const expected = "const x = 1;\n\nconst y = 2;";
    expect(extractCodeFromResponse(input)).toBe(expected);
  });

  test("should remove standalone backticks", () => {
    const input = "Here is some code: ```const x = 1;```";
    const expected = "Here is some code: const x = 1;";
    expect(extractCodeFromResponse(input)).toBe(expected);
  });

  test("should return plain text when no code blocks are present", () => {
    const input = "Just plain text without any code blocks";
    expect(extractCodeFromResponse(input)).toBe(input);
  });

  test("should handle empty string", () => {
    expect(extractCodeFromResponse("")).toBe("");
  });

  test("should handle null input", () => {
    // @ts-expect-error Testing null input
    expect(extractCodeFromResponse(null)).toBe("");
  });
});
