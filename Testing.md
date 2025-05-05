1. Clone this repository
2. Run `pnpm build`
3. Create `sandbox` folder in parallel to this repository
4. Run `./../open-code-cli/bin/run workflow ../open-code-cli/examples/nextjs-shadcn.json`
5. Run `./../open-code-cli/bin/run workflow ../open-code-cli/examples/fumadocs-blog.json`

```
rm -rf my-blog && ./../open-code-cli/bin/run workflow ../open-code-cli/examples/fumadocs-blog.json
```

```
rm -rf docs-blog && ./../open-code-cli/bin/run workflow ../open-code-cli/examples/fumadocs-and-blog.json
```

---

rjvim blog workflow

6. Ask app name
7. create next-app@latest {{app_name}} --typescript --tailwind --eslint --yes
8.

pnpm dlx giget gh:fuma-nama/fumadocs/examples/next-mdx/mdx-components.tsx src/mdx-components.tsx --force

```bash
node ./dist/run.js workflow examples/ai-merge-example.json
```
