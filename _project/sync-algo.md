There is "source" and there is "local".

## First Time Sync

- We just copy everything from source to local
- We need to copy only the paths which user mentioned in the workflow file to the local which user wants to sync

## Sync from next time

In short there is a local file, source file.

There are multiple scenarios possible:

1. There is new source file which isn't there in local, so we copy
2. The file changes in source file, so we might need to copy it
3. But if the source file changes, local file changed, then we need to use ai merge
4. If only local file changed, and source file didn't change then we don't need to do anything

So, in short we use a logic

- sourceFileHash: Hash of the latest source file
- localFileHash: Hash of the current local file hash
- trackerFileHash: Hash of the local file when last sync happened which is stored in tracker

## Problem

After merging changes - It means we have local file changes and also source file changes.

When we sync next time - sourceFileHash & localFileHash will be different, and trackerFileHash will be same as localFileHash. And it will trigger copy. It shouldn't trigger a copy (it should trigger merge or do nothing so that local changes won't be lost)

We need to change the algorithm,

1. When we copy the file, we need to track for which "commit" of source the localFile is tracking (The hash of localFileHash can be different from sourceFileHash)
2. When we have to take a decision to copy/merge/none, we need to merge or none, we need to know which commit the local file is tracking. If the source file is a different commit then local is tracking - then we need to do merge. If the local is already tracking the same as source - then we do nothing.
