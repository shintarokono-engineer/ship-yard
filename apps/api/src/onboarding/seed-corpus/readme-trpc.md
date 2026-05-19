---
type: README
title: tRPC — End-to-end typesafe APIs made easy
source_url: https://github.com/trpc/trpc
license: MIT
original_author: Alex Johansson (KATT) and tRPC contributors
---

# tRPC

**Move fast and break nothing. End-to-end typesafe APIs made easy.**

## Intro

tRPC allows you to easily build & consume fully typesafe APIs without schemas or code generation.

### Features

- ✅ Well-tested and production ready.
- 🧙‍♂️ Full static typesafety & autocompletion on the client, for inputs, outputs, and errors.
- 🐎 Snappy DX - No code generation, run-time bloat, or build pipeline.
- 🍃 Light - tRPC has zero deps and a tiny client-side footprint.
- 🐻 Easy to add to your existing brownfield project.
- 🔋 Batteries included - React.js/Next.js/Express.js/Fastify adapters. _(But tRPC is not tied to React, and there are many community adapters for other libraries.)_
- 🥃 Subscriptions support.
- ⚡️ Request batching - requests made at the same time can be automatically combined into one.
- 👀 Quite a few examples in the [./examples](./examples)-folder.

## Quickstart

There are a few [examples](https://trpc.io/docs/example-apps) that you can use for playing with tRPC or bootstrapping your new project. For example, if you want a Next.js app, you can use the full-stack Next.js example:

**Quick start with a full-stack Next.js example:**

```sh
# pnpm
pnpm create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter

# npm
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter

# yarn
yarn create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter

# bun
bunx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

**👉 See full documentation on [tRPC.io](https://trpc.io/docs). 👈**

## Core Team

> Do you want to contribute? First, read the [Contributing Guidelines](https://github.com/trpc/trpc/blob/main/CONTRIBUTING.md) before opening an issue or PR so you understand the branching strategy and local development environment. If you need any more guidance or want to ask more questions, feel free to write to us on [Discord](https://trpc.io/discord)!

### Project leads

- Alex / KATT
- Julius Marminge
- Nick Lucas

## Sponsors

If you enjoy working with tRPC and want to support us, consider giving a token appreciation by [GitHub Sponsors](https://trpc.io/sponsor)!
