---
type: README
title: Trigger.dev — Open source platform for AI workflows and background jobs in TypeScript
source_url: https://github.com/triggerdotdev/trigger.dev
license: Apache-2.0
original_author: Trigger.dev, Inc.
---

# Trigger.dev

**Build and deploy fully‑managed AI agents and workflows.**

[Website](https://trigger.dev) | [Docs](https://trigger.dev/docs) | [Example projects](https://github.com/triggerdotdev/examples) | [Self-hosting](https://trigger.dev/docs/self-hosting/overview)

## About Trigger.dev

Trigger.dev is the open-source platform for building AI workflows in TypeScript. Long-running tasks with retries, queues, observability, and elastic scaling.

## The platform designed for building AI agents

Build [AI agents](https://trigger.dev/product/ai-agents) using all the frameworks, services and LLMs you're used to, deploy them to Trigger.dev and get durable, long-running tasks with retries, queues, observability, and elastic scaling out of the box.

- **Long-running without timeouts**: Execute your tasks with absolutely no timeouts, unlike AWS Lambda, Vercel, and other serverless platforms.
- **Durability, retries & queues**: Build rock solid agents and AI applications using our durable tasks, retries, queues and idempotency.
- **True runtime freedom**: Customize your deployed tasks with system packages – run browsers, Python scripts, FFmpeg and more.
- **Human-in-the-loop**: Programmatically pause your tasks until a human can approve, reject or give feedback.
- **Realtime apps & streaming**: Move your background jobs to the foreground by subscribing to runs or streaming AI responses to your app.
- **Observability & monitoring**: Each run has full tracing and logs. Configure error alerts to catch bugs fast.

## Key features

- **JavaScript and TypeScript SDK** — Build background tasks using familiar programming models
- **Long-running tasks** — Handle resource-heavy tasks without timeouts
- **Durable cron schedules** — Create and attach recurring schedules of up to a year
- **Trigger.dev Realtime** — Trigger, subscribe to, and get real-time updates for runs, with LLM streaming support
- **Build extensions** — Hook directly into the build system and customize the build process. Run Python scripts, FFmpeg, browsers, and more.
- **React hooks** — Interact with the Trigger.dev API on your frontend using our React hooks package
- **Batch triggering** — Use `batchTrigger()` to initiate multiple runs of a task with custom payloads and options
- **Structured inputs / outputs** — Define precise data schemas for your tasks with runtime payload validation
- **Waits** — Add waits to your tasks to pause execution for a specified duration
- **Preview branches** — Create isolated environments for testing and development. Integrates with Vercel and git workflows
- **Waitpoints** — Add human-in-the-loop judgment at critical decision points without disrupting workflow
- **Concurrency & queues** — Set concurrency rules to manage how multiple tasks execute
- **Multiple environments** — Support for DEV, PREVIEW, STAGING, and PROD environments
- **No infrastructure to manage** — Auto-scaling infrastructure that eliminates timeouts and server management
- **Automatic retries** — If your task encounters an uncaught error, we automatically attempt to run it again
- **Checkpointing** — Tasks are inherently durable, thanks to our checkpoint/resume system
- **Versioning** — Atomic versioning allows you to deploy new versions without affecting running tasks
- **Machines** — Configure the number of vCPUs and GBs of RAM you want the task to use
- **Observability & monitoring** — Monitor every aspect of your tasks' performance with comprehensive logging and visualization tools
- **Tags / Run metadata / Bulk actions / Real-time alerts** — Operational primitives for filtering, live updates, and incident response

## Write tasks in your codebase

Create tasks where they belong: in your codebase. Version control, localhost, test and review like you're already used to.

```ts
import { task } from "@trigger.dev/sdk";

// 1. You need to export each task
export const helloWorld = task({
  // 2. Use a unique id for each task
  id: "hello-world",
  // 3. The run function is the main function of the task
  run: async (payload: { message: string }) => {
    // 4. You can write code that runs for a long time here, there are no timeouts
    console.log(payload.message);
  },
});
```

## Deployment

Use our SDK to write tasks in your codebase. There's no infrastructure to manage, your tasks automatically scale and connect to our cloud. Or you can always self-host.

## Environments

We support `Development`, `Staging`, `Preview`, and `Production` environments, allowing you to test your tasks before deploying them to production.

## Full visibility of every job run

View every task in every run so you can tell exactly what happened. We provide a full trace view of every task run so you can see what happened at every step.

## Getting started

The quickest way to get started is to create an account and project in our [web app](https://cloud.trigger.dev), and follow the instructions in the onboarding. Build and deploy your first task in minutes.

### Useful links

- [Quick start](https://trigger.dev/docs/quick-start) — get up and running in minutes
- [How it works](https://trigger.dev/docs/how-it-works) — understand how Trigger.dev works under the hood
- [Guides and examples](https://trigger.dev/docs/guides/introduction) — walk-through guides and code examples for popular frameworks and use cases

## Self-hosting

If you prefer to self-host Trigger.dev, you can follow our [self-hosting guides](https://trigger.dev/docs/self-hosting/overview):

- [Docker self-hosting guide](https://trigger.dev/docs/self-hosting/docker) — use Docker Compose to spin up a Trigger.dev instance
- [Kubernetes self-hosting guide](https://trigger.dev/docs/self-hosting/kubernetes) — use our official Helm chart to deploy Trigger.dev to your Kubernetes cluster

## Support and community

We have a large active community in our official [Discord server](https://trigger.dev/discord) for support, including a dedicated channel for self-hosting.
