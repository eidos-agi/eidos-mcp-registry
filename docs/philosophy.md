# Why This Exists

## The Problem

You have 33 MCP servers installed at user scope. Every project sees every tool. Cerebro leaks into Duet, taskr into Greenmark, wrike into personal repos. Your AI burns context loading tool definitions it will never use, and fires tools where they have no business running.

This isn't a configuration mistake. It's a missing layer.

## MCP Is Not Dying. It's Becoming Infrastructure.

In early 2026, the "MCP is dead" narrative hit peak volume. Perplexity's CTO said they're moving away from it. Garry Tan called it trash. The top of Hacker News declared the CLI had won.

The arguments sound right if you're a solo developer wiring up three tools on your laptop:

- **Context window bloat.** Loading 50 tool schemas before the agent reads your prompt is wasteful.
- **Auth is clunky.** OAuth 2.1 is ceremony when you just want to call an API.
- **LLMs are smart enough.** Give the agent a CLI or a REST endpoint and it'll figure it out.
- **Unnecessary abstraction.** Why add a protocol layer over APIs that already exist?

Every one of these arguments was made about API gateways in 2015. "Just call the service directly. Why do I need Kong/Envoy? It's overhead." That argument held until you had 50 microservices, 20 engineers, and a compliance audit.

## What the Critics Get Wrong

**The context window problem is solved.** OpenAI shipped tool search in the Responses API — tools load only when the model needs them. Anthropic and Cloudflare independently converged on "Code Mode," where agents write code against MCP tools instead of loading schemas into context. Anthropic measured a 98.7% reduction in token usage. This is last year's problem.

**The CLI argument breaks at team scale.** A CLI runs as you. Your credentials, your permissions, no distinction between "I did this" and "my agent did this." For one developer on their own machine, fine. For a company with 50 engineers and agents touching production systems, terrifying. MCP creates a permission boundary that CLIs don't have. OAuth 2.1, user-level consent, token expiry, scoped access, audit trails. The CLI alternative is API keys in environment variables.

**The projects held up as proof that MCP lost still use MCP underneath.** Perplexity's new Agent API is a managed MCP gateway with better branding. OpenClaw's skill marketplace, ClawHub, runs on MCP servers. Cloudflare's Code Mode — framed as the "MCP killer" — uses MCP's discovery layer to find tools before converting them to a typed API. They didn't abandon the protocol. They wrapped it in better DX.

17,000 MCP servers. 97 million monthly SDK downloads. Stewarded by the Linux Foundation. Adopted by OpenAI, Google, Microsoft, and AWS. The 2026 roadmap focuses on horizontal scaling and enterprise auth.

Nobody writes viral tweets about TCP/IP. Infrastructure is boring. MCP is becoming infrastructure.

## What MCP Genuinely Sucks At

Intellectual honesty requires acknowledging the real gaps:

**No first-class async operations.** The spec is request-response. A tool that kicks off a 20-minute pipeline has no elegant pattern — the agent polls a `getStatus` endpoint. No job IDs, no webhooks, no callbacks in the spec.

**No streaming.** Tailing logs, build output, real-time data feeds — none of this fits the current model.

**Debugging is painful.** When a tool call fails, the surface area is massive: bad prompt? Misinterpreted manifest? Schema error? API bug? Expired token? Scope issue? The debugging story is "good luck."

**No versioning story.** Breaking changes to an MCP's API can silently break every agent depending on it. Traditional API management solved this years ago. MCP hasn't.

**Semantic composition gap.** MCP tells the agent *what* a tool does (function signature) but not *what its outputs mean*. If `get_user_orders` returns `customer_id` and `get_shipping_status` expects `user-identifier`, the agent has to guess they're the same thing.

These are real problems. They're also solvable problems, and they're being actively worked on. They don't invalidate the protocol — they define the roadmap.

## The Strongest Counter-Argument

The most honest case against MCP isn't that it's wrong. It's that it's premature overhead for small teams.

A 5-person startup calling 3 internal APIs doesn't need OAuth 2.1 and manifests. A Python function with an API key in a vault takes hours, not days. MCP introduces ceremony for zero immediate benefit when you're inside a trusted VPC with a closed set of tools you already own.

This is true. And it's the same argument people made against Kubernetes when they had 3 services. The question isn't whether MCP is needed today. It's whether you'll need the permission boundary, the audit trail, and the scope management when you have 50 agents running across your org. If the answer is yes, the migration cost of adding it later far exceeds the cost of starting with it now.

## What This Tool Solves

The Eidos MCP Registry solves the first concrete problem you hit when MCP works but isn't managed: **scope**.

Every MCP server at user scope means every project gets every tool. This wastes context, causes misfires, and makes it impossible to reason about what an agent in a specific workspace can do.

The registry introduces a hierarchy:

```
User (dshanklinbv)
  github, context7          <- available everywhere
  repos-aic/                <- workspace group
    taskr, wrike            <- scoped to this group
  repos-eidos-agi/
    cerebro, rhea-diagrams
  repos-personal/
    outlook, reeves
```

Servers flow down. User-scoped servers are inherited by all groups. Group-scoped servers are inherited by all repos in that group. Per-repo overrides handle exceptions.

Click Deploy, and `.mcp.json` files propagate to every repo in the group. Open Claude Code in any repo and it only sees the tools that belong there.

This is the control plane for who sees what. It's the first layer of the permission boundary between "I installed this" and "this agent should use this."

## The Bigger Picture

MCP scope management is table stakes. The real product is the governance layer:

- **Drift detection.** Which MCPs are configured in Claude Code but not in the registry? (The tattle-tale report.)
- **Deploy preview.** See exactly what changes before they hit disk.
- **Health monitoring.** Which servers are connected, failed, or need auth?
- **Audit trail.** Who assigned what to where, and when?

The registry doesn't replace MCP. It makes MCP manageable. And manageable infrastructure is the only kind that survives contact with a real team.
