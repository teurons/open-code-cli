// Test script for extractCodeFromResponse function
const { extractCodeFromResponse } = require('./dist/utils/ai-utils');

// Test cases
const testCases = [
  {
    name: "With code block",
    input: "Here is the code:\n```typescript\nconst x = 1;\n```",
    expected: "const x = 1;"
  },
  {
    name: "With multiple code blocks",
    input: "First block:\n```typescript\nconst x = 1;\n```\nSecond block:\n```typescript\nconst y = 2;\n```",
    expected: "const x = 1;\n\nconst y = 2;"
  },
  {
    name: "With standalone backticks",
    input: "Here is some code: ```const x = 1;```",
    expected: "Here is some code: const x = 1;"
  },
  {
    name: "No code blocks",
    input: "Just plain text without any code blocks",
    expected: "Just plain text without any code blocks"
  },
  {
    name: "Empty string",
    input: "",
    expected: ""
  }
];

// Run tests
testCases.forEach(test => {
  const result = extractCodeFromResponse(test.input);
  console.log(`Test: ${test.name}`);
  console.log(`Result: "${result}"`);
  console.log(`Expected: "${test.expected}"`);
  console.log(`Passed: ${result === test.expected}\n`);
});
