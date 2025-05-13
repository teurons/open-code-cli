Contribute Command works as companion to gh-sync, but doesn't work as part of it.

If someone runs contribute command, it basically goes to tracker file. It doesn't work with workflow file. It finds the files in local path which are tracked using a source, and which have forkedRepo set.

- It will clone the forked repo
- It will make a branch from it's main
- It will use the localPath and sourcePath
- It will mostly do two things
  - overwrite the source file with local file
  - create the local file at correct path in source file by mapping it
- It will push the branch
- It will create PR
