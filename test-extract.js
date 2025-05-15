// Test script for extractCodeFromResponse function
import { extractCodeFromResponse } from "./dist/utils/ai-utils.js";
import { logger } from "./dist/logger.js";

// Test cases
const testCases = [
  {
    name: "With code block",
    input: "Here is the code:\n```typescript\nconst x = 1;\n```",
    expected: "const x = 1;",
  },
  {
    name: "With multiple code blocks",
    input:
      "First block:\n```typescript\nconst x = 1;\n```\nSecond block:\n```typescript\nconst y = 2;\n```",
    expected: "const x = 1;\n\nconst y = 2;",
  },
  {
    name: "With standalone backticks",
    input: "Here is some code: ```const x = 1;```",
    expected: "Here is some code: const x = 1;",
  },
  {
    name: "No code blocks",
    input: "Just plain text without any code blocks",
    expected: "Just plain text without any code blocks",
  },
  {
    name: "Empty string",
    input: "",
    expected: "",
  },
];

// Run tests
let allPassed = true;
testCases.forEach(test => {
  const result = extractCodeFromResponse(test.input);
  const passed = result === test.expected;
  if (!passed) {
    allPassed = false;
    logger.error(`Test failed: ${test.name}`);
    logger.error(`Result: "${result}"`);
    logger.error(`Expected: "${test.expected}"`);
  } else {
    logger.info(`Test passed: ${test.name}`);
  }
});

if (allPassed) {
  logger.info("All tests passed!");
} else {
  logger.error("Some tests failed!");
  process.exit(1);
}
