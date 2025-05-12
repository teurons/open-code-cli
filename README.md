# Open Code CLI

A powerful task-based workflow automation CLI built with TypeScript. This tool enables developers to define and execute complex workflows through JSON configuration files, automating repetitive development tasks and streamlining project setup processes.

## Features

- **Task-based Workflow System:** Define complex sequences of operations as JSON workflow files
- **Variable Context Management:** Share data between tasks using a context system with variable replacement
- **Package Manager Integration:** Automatic detection of npm, yarn, or pnpm with appropriate command execution
- **AI-powered Code Operations:** Merge, modify, and generate code using AI capabilities
- **Directory Context Tracking:** Maintain proper working directory context across task execution
- **Interactive User Prompts:** Collect user input during workflow execution

## Prerequisites

Before you begin, ensure you have installed [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) on your system.

## Getting Started

To start using this CLI TypeScript starter, follow these steps:

### 1. Make a new project

```sh
npx cli-typescript-starter create my-project
```

or

```sh
npx giget@latest gh:kucherenko/cli-typescript-starter my-project
```

or

```sh
pnpm exec degit kucherenko/cli-typescript-starter my-project
```

### 2. Install dependencies

Navigate to your project directory and install the necessary dependencies:

```sh
cd my-project && pnpm install
```

### 3. Configure the package

Update the `package.json` to reflect your project's details:

- Rename the package:
  ```json
  "name": "my-project",
  ```
- Set the command name:
  ```json
  "bin": {
    "my-project": "./bin/run"
  }
  ```

### 4. Set up environment variables

Create a `.env` file in the root directory and configure your environment variables as needed.

## Workflow Command

The `workflow` command is the core functionality of Open Code CLI, allowing you to define and execute sequences of tasks from a JSON configuration file.

### Usage

```bash
open-code-cli workflow <file>
# or using the alias
open-code-cli w <file>
```

Where `<file>` is the path to a JSON workflow configuration file.

### Workflow Structure

A workflow file is a JSON file with the following structure:

```json
{
  "workflow": [
    {
      "task": "task_type"
      // task-specific configuration
    }
    // more tasks...
  ]
}
```

Each task in the workflow array has a `task` property that identifies the type of task to execute, along with task-specific configuration properties.

### Variable Replacement

Workflows support variable replacement using the `{{variable}}` syntax. Variables can be defined by prompt tasks and referenced in subsequent tasks:

```json
{
  "task": "execute",
  "command": "mkdir {{project_name}}",
  "depends": ["project_name"]
}
```

The `depends` array specifies which variables must be defined before the task can execute.

### Task Types

The workflow system supports the following task types:

#### `prompt`

Collects user input and stores it in the context system for use by other tasks.

```json
{
  "task": "prompt",
  "name": "project_name",
  "message": "Enter your project name",
  "type": "input",
  "default": "my-project"
}
```

Supported prompt types:

- `input`: Text input (default)
- `select`: Selection from options list
- `confirm`: Yes/No confirmation

#### `execute`

Executes shell commands with variable replacement.

```json
{
  "task": "execute",
  "command": "mkdir -p {{directory}}",
  "depends": ["directory"]
}
```

Alternatively, you can specify multiple commands:

```json
{
  "task": "execute",
  "commands": ["mkdir -p src", "touch src/index.ts"]
}
```

#### `npm_cmd`

Executes package manager commands with automatic detection of npm, yarn, or pnpm.

```json
{
  "task": "npm_cmd",
  "command": "install react react-dom",
  "package_manager": "auto"
}
```

The `package_manager` can be `auto`, `npm`, `yarn`, or `pnpm`.

#### `npm_install`

Installs packages using the detected package manager.

```json
{
  "task": "npm_install",
  "packages": ["react", "react-dom"],
  "dev": false,
  "package_manager": "auto"
}
```

Set `dev: true` to install as dev dependencies.

#### `npm_execute`

Runs a script from package.json using the detected package manager.

```json
{
  "task": "npm_execute",
  "script": "build",
  "package_manager": "auto"
}
```

#### `gh_sync`

Fetches files or directories from GitHub repositories.

```json
{
  "task": "gh_sync",
  "repo": "owner/repo",
  "path": "path/to/file.ts",
  "output": "./local/path/file.ts",
  "branch": "main"
}
```

#### `write`

Writes content to a file with variable replacement.

```json
{
  "task": "write",
  "file": "README.md",
  "content": "# {{project_name}}\n\nCreated with Open Code CLI"
}
```

#### `ai_merge_file`

Merges two files using AI capabilities.

```json
{
  "task": "ai_merge_file",
  "targetFile": "./target.ts",
  "sourceFile": "./source.ts",
  "outputFile": "./output.ts"
}
```

#### `ai_content_merge`

Merges content strings using AI.

```json
{
  "task": "ai_content_merge",
  "targetContent": "...",
  "sourceContent": "...",
  "outputFile": "./output.ts"
}
```

#### `ai_modify_file`

Modifies a file using AI with specific instructions.

```json
{
  "task": "ai_modify_file",
  "file": "./target.ts",
  "instructions": "Add TypeScript types to all functions",
  "outputFile": "./modified.ts"
}
```

### Script Commands

This starter comes with several predefined scripts to help with development:

- `pnpm build` - Build the project using `tsup`.
- `pnpm build:watch` - Automatically rebuild the project on file changes.
- `pnpm commit` - run `commitizen` tool for helping with commit messages.
- `pnpm commitlint` - lint commit messages.
- `pnpm compile` - Compile TypeScript files using `tsc`.
- `pnpm clean` - Remove compiled code from the `dist/` directory.
- `pnpm format` - Check files for code style issues using Prettier.
- `pnpm format:fix` - Automatically fix code formatting issues with Prettier.
- `pnpm lint` - Check code for style issues with ESLint.
- `pnpm lint:fix` - Automatically fix code style issues with ESLint.
- `pnpm start [command]` - Run the CLI application using `ts-node`.
- `pnpm start:node [command]` - Run the CLI application from the `dist/` directory.
- `pnpm test` - Run unit tests.
- `pnpm test:watch` - Run tests and watch for file changes.

### Example Workflow

Here's an example workflow that sets up a Next.js project with Shadcn UI components:

```json
{
  "workflow": [
    {
      "task": "prompt",
      "name": "app_name",
      "message": "Enter the name of your app",
      "type": "input",
      "default": "my-app"
    },
    {
      "task": "npm_cmd",
      "command": "create next-app@latest {{app_name}} --typescript --tailwind --eslint --yes",
      "package_manager": "auto"
    },
    {
      "task": "execute",
      "command": "cd {{app_name}}",
      "depends": ["app_name"]
    },
    {
      "task": "npm_cmd",
      "commands": ["shadcn@latest init", "shadcn@latest add button"],
      "package_manager": "auto"
    },
    {
      "task": "execute",
      "command": "pnpm dev",
      "package_manager": "auto"
    }
  ]
}
```

This workflow:

1. Prompts for an application name
2. Creates a new Next.js project with that name
3. Changes directory to the new project
4. Initializes Shadcn UI and adds a button component
5. Starts the development server

## OpenRouter Integration

The AI-powered tasks require an OpenRouter API key. You can configure this using the `init-open-router` command:

```bash
open-code-cli init-open-router
```

This will prompt you for your API key and preferred model, storing the configuration in `~/.open-code-cli/openrouter.json`.

## Creating Custom Tasks

You can extend the workflow system by creating custom task implementations:

1. Create a new task class that implements the `Task` interface
2. Register your task with the task registry

```typescript
export class MyCustomTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    // Implementation here
  }

  public validate(config: CommonTaskConfig): boolean {
    // Validation logic here
    return true
  }
}

// Register the task
const registry = createTaskRegistry()
registry.registerTask('my_custom_task', new MyCustomTask())
```

## Core Algorithms

### File Action Decision Algorithm

The `actionOnFile` function determines what action to take on a file during synchronization by comparing file hashes:

```
Function: actionOnFile(sourcePath, localPath, repo, relativeLocalPath, trackerConfig, sourceCommitHash)

1. If local file doesn't exist:
   - Return COPY action

2. Calculate hashes:
   - sourceFileHash = hash of source file
   - localFileHash = hash of local file
   - trackerFileHash = hash from tracker config (or null if not tracked)
   - lastCommitHash = commit hash from tracker (or null)
   - currentCommitHash = sourceCommitHash or lastCommitHash (or null)

3. Special handling for previously merged files:
   - If trackerAction is MERGE:
     - If lastCommitHash equals currentCommitHash:
       - Return NONE action (no changes needed)
     - Otherwise:
       - Return MERGE action (commit hash changed)

4. If no tracking data exists (trackerFileHash is null):
   - Return COPY action (first time syncing)

5. Compare file hashes:
   - If localFileHash equals trackerFileHash AND localFileHash doesn't equal sourceFileHash:
     - Return COPY action (only source file changed)
   - If localFileHash doesn't equal trackerFileHash AND trackerFileHash equals sourceFileHash:
     - Return NONE action (only local file changed)
   - If localFileHash doesn't equal trackerFileHash AND localFileHash equals sourceFileHash:
     - Return COPY action (local changes pushed to source)
   - If localFileHash doesn't equal trackerFileHash AND localFileHash doesn't equal sourceFileHash:
     - Return MERGE action (both files changed independently)

6. Default case:
   - Return NONE action (no changes detected)
```

This algorithm ensures files are properly synchronized while preserving local changes when appropriate and merging when necessary.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

Happy Automating!
