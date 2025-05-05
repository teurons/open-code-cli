#!/bin/bash

# Script to fix 'any' type errors in task files

# List of files to update
FILES=(
  "src/tasks/ai-content-merge.ts"
  "src/tasks/ai-modify-file.ts"
  "src/tasks/edit-json.ts"
  "src/tasks/execute.ts"
  "src/tasks/gh-fetch.ts"
  "src/tasks/merge-file.ts"
  "src/tasks/merge-ts-file.ts"
  "src/tasks/npm-cmd.ts"
  "src/tasks/npm-execute.ts"
  "src/tasks/npm-install.ts"
  "src/tasks/patch-file.ts"
  "src/tasks/prompt.ts"
  "src/tasks/write.ts"
  "src/utils/ai-utils.ts"
)

# Function to update validate method
update_validate_method() {
  local file=$1
  sed -i '' 's/validate(config: Record<string, any>): boolean/validate(config: CommonTaskConfig): boolean/g' "$file"
  sed -i '' 's/validate(config: any): boolean/validate(config: CommonTaskConfig): boolean/g' "$file"
}

# Function to update imports
add_import() {
  local file=$1
  if ! grep -q "import { TaskConfig as CommonTaskConfig } from '../types/common'" "$file"; then
    if grep -q "import { Task, TaskContext } from './types'" "$file"; then
      sed -i '' 's/import { Task, TaskContext } from '\''\.\/types'\''/import { Task, TaskContext } from '\''\.\/types'\''\nimport { TaskConfig as CommonTaskConfig } from '\''\.\.\/types\/common'\''/g' "$file"
    else
      # Add import at the top of the file
      sed -i '' '1s/^/import { TaskConfig as CommonTaskConfig } from '\''\.\.\/types\/common'\''\n/' "$file"
    fi
  fi
}

# Function to update other any types
update_other_any_types() {
  local file=$1
  # Replace any with unknown in specific patterns
  sed -i '' 's/: any)/: unknown)/g' "$file"
  sed -i '' 's/: any;/: unknown;/g' "$file"
  sed -i '' 's/as any/as unknown/g' "$file"
}

# Process each file
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    add_import "$file"
    update_validate_method "$file"
    update_other_any_types "$file"
  else
    echo "File $file not found, skipping."
  fi
done

echo "Done updating files."
