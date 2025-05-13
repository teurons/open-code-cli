```
{
  "repos": {
    "rjvim/test-open-code-cli": {
      "branch": "main",
      "lastCommitHash": "0531e0b7c610aa1f0cc39c0237a572bacb00db77",
      "syncedAt": "2025-05-13T10:51:59.309Z",
      "filePaths": [
        {
          "source": "/",
          "local": "test-open-code-cli"
        }
      ],
      "files": {
        "test-open-code-cli/LICENSE": {
          "hash": "fa4ac20ca1a61a009dde024fea7c8bf5",
          "syncedAt": "2025-05-13T10:51:59.287Z",
          "action": "copy",
          "relativeSourcePath": "LICENSE"
        },
        "test-open-code-cli/README.md": {
          "hash": "56c95eb543f69699799eae237b1f6ae5",
          "syncedAt": "2025-05-13T10:51:59.297Z",
          "action": "copy",
          "relativeSourcePath": "README.md"
        }
      },
      "forkRepo": "myorg/test-open-code-cli-fork"
    }
  }
}
```

Above is an example tracker file, using this we need to build a new flow called contribute. There can be multiple repos.

- "rjvim/test-open-code-cli" - Is the repo on github, the original source code
- "forkRepo" is the repo using which we raise a PR

We should introduce a new command called contribute.

- If someone runs contribute command, it basically goes to tracker file.
- It will find repos which have forkRepo
- First, it will clone the forked repo
- It will make a branch from it's main
- It will iterate over filePaths
  - For each filePath, it will recursively go through local
  - For each file, it will determine the full source path
  - It will prepare all as sync operations array
  - Each sync operation has - absoluteLocalPath, absoluteSourcePath, relativeLocalPath, relativeSourcePath
  - relative paths are relative to source, local keys inside filePaths including source and local path
- It will execute sync operations
- It will push the branch
- It will create PR

Contribute additionally has a --dry-run command, which doesn't actually execute sync, push the branch and create pr. It will execute a dry run of sync operations functions and print what files would be copied from local to source (relative paths).
