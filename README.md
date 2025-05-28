# Open Code CLI - GitHub Sync Workflow

A powerful CLI tool for syncing files and directories from GitHub repositories to your local machine using workflow configurations.

## Prerequisites

- Node.js 16+ installed
- Git installed
- GitHub personal access token with appropriate repository access

## Installation

```bash
# Install globally
npm install -g open-code-cli

# Or use with npx
npx open-code-cli workflow workflow.json
```

## GitHub Sync Workflow

The `gh_sync` task allows you to synchronize files and directories from GitHub repositories to your local machine.

### Basic Usage

Create a JSON workflow file (e.g., `sync-config.json`) with the following structure:

```json
{
  "workflow": [
    {
      "task": "gh_sync",
      "repos": [
        {
          "repo": "owner/repo-name",
          "sync": true,
          "force": false,
          "branch": "main",
          "files": [
            {
              "source": "path/in/repo",
              "local": "local/path"
            }
          ]
        }
      ]
    }
  ]
}
```

Run the workflow:

```bash
open-code-cli workflow sync-config.json
```

### Configuration Options

#### Repository Configuration

| Property    | Type      | Required | Description                                      |
|-------------|-----------|----------|--------------------------------------------------|
| repo        | string    | Yes      | GitHub repository in format `owner/repo`         |
| sync        | boolean   | No       | Whether to sync this repository (default: true)  |
| force       | boolean   | No       | Force sync even if files haven't changed         |
| branch      | string    | No       | Branch to sync from (default: main)              |
| forkRepo    | string    | No       | Fork repository to use instead of the main repo  |
| files       | File[]    | Yes      | Array of file mappings                           |


#### File Mapping

| Property | Type   | Required | Description                                      |
|----------|--------|----------|--------------------------------------------------|
| source   | string | Yes      | Path in the repository to sync from             |
| local    | string | Yes      | Local path to sync to                           |


### Example Configuration

```json
{
  "workflow": [
    {
      "task": "gh_sync",
      "repos": [
        {
          "repo": "locospec/lens",
          "sync": true,
          "force": false,
          "branch": "main",
          "files": [
            {
              "source": "packages/lens-react/lib",
              "local": "resources/shared-js/locospec/lens-react/lib"
            }
          ]
        },
        {
          "repo": "locospec/engine-php",
          "sync": true,
          "force": false,
          "branch": "main",
          "forkRepo": "locospec/engine-php",
          "files": [
            {
              "source": "/",
              "local": "LCS/engine-php"
            }
          ]
        },
        {
          "repo": "locospec/locospec-laravel",
          "sync": true,
          "force": false,
          "branch": "main",
          "forkRepo": "locospec/locospec-laravel",
          "files": [
            {
              "source": "/",
              "local": "LCS/locospec-laravel"
            }
          ]
        }
      ]
    }
  ]
}
```

### How It Works

1. The tool checks if the local copy of each file exists and compares it with the remote version
2. If the remote file is different, it will be downloaded and saved locally
3. If `force: true`, files will be re-downloaded even if they haven't changed
4. The tool maintains a cache of file hashes to track changes
5. Only changed files are downloaded to minimize network usage

### Best Practices

1. Always specify the `branch` to avoid unexpected updates
2. Use `force: true` sparingly to avoid unnecessary downloads
3. Organize your file mappings logically for easier maintenance
4. Add `.open-code-cli` to your `.gitignore` to avoid committing cache files


## OpenRouter Integration

The AI-powered tasks require an OpenRouter API key. You can configure this using the `init-open-router` command:

```bash
open-code-cli init-open-router
```

This will prompt you for your API key and preferred model, storing the configuration in `~/.open-code-cli/openrouter.json`.

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
