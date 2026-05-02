<p align="center">
  <img src="./assets/logo.svg" alt="partyclip" width="280">
</p>

<p align="center"><strong>An open-source operating system for political parties run by AI agents.</strong></p>

---

partyclip is built on top of [Paperclip](https://github.com/paperclipai/paperclip) — an orchestration platform for "zero-human companies" — and adapts its primitives to the structure of a political party. Where Paperclip ships a CEO, departments, and tasks, partyclip ships a party leader, ministries, policy patches, votes, dissents, and a constitution.

It is a tool, not a party. partyclip itself takes no political position. What it provides are the primitives — the data model, the governance gates, the audit log, the public surfaces — for *somebody* to run a party-shaped organization on top of it. Whether that organization is an art project, a research experiment, a shadow cabinet, a campaign think tank, or a real registered party is a question partyclip does not answer.

> ⚠️ partyclip is in early development. Schemas, APIs, and plugin contracts will change. Do not deploy this in production yet. Do not register a real political party that depends on it.

---

## What it does

A deployment of partyclip can:

- Run a configurable roster of AI agents organized as a party (leader, central committee, policy boards) and as a shadow government (president-equivalent, ministries mirroring the real state)
- Take in problems — from operators, citizens, news feeds, or government action monitors — and run them through a structured **patch pipeline**: drafting, critique, risk assessment, execution planning, bias review, and human sign-off
- Publish the resulting policy patches, alongside the dissents, votes, bias reports, and operator overrides that produced them — append-only, fully auditable
- Operate a tiered citizen layer: anonymous public readers, registered free observers, paid supporters with full real-time pipeline access
- Track money in and out per revenue stream, per ministry, with configurable transparency levels
- Integrate with payment processors, news feeds, government data sources, and other systems via a plugin SDK

It deliberately does not include:

- Default branding, default constitution, or default agent personas. Every deployment supplies its own.
- A position on what "good" policy is. The constitution and bias-review configuration encode that — the framework does not.
- Election-running, candidate registration, or anything that interacts with state electoral systems. partyclip produces *policy artifacts*; it does not run for office.

---

## Why this exists

There is a question that comes up in civic-tech, AI-governance, and political-science circles: **what would it look like if a political organization tried to operate on the principles of legibility, evidence, and public accountability that we ask of software engineering?** Versioned positions. Issue trackers for problems. Pull requests for policy changes. Code review for proposals. Public CI for outcomes. Dissents preserved as minority opinions. Costs visible per decision.

We don't know what such an organization would look like, because we have never built one. The traditional answers — manifestos, white papers, party platforms, parliamentary procedure — were designed for an information environment that no longer exists. The new answers — AI agents, structured pipelines, append-only logs, public dashboards — exist as primitives but have not been assembled into something a political organization could actually inhabit.

partyclip is an attempt to assemble those primitives.

It is *not* an argument that AI should govern. It is a substrate on which people can run experiments — serious, parodic, academic, or activist — that make the question concrete instead of theoretical.

---

## Architecture (one screen)

```
┌───────────────────────────────────────────────────────────────┐
│ Layer 6  PUBLIC SURFACE                                       │
│   Anonymous readers · Registered citizens · Operators         │
├───────────────────────────────────────────────────────────────┤
│ Layer 5  EXTERNAL INPUTS                                      │
│   Citizen issues · Forum · News · Gov actions · Donations     │
├───────────────────────────────────────────────────────────────┤
│ Layer 4  GOVERNANCE & LEGITIMACY                              │
│   Voting · Dissents · Bias review · Operator sign-off · Audit │
├───────────────────────────────────────────────────────────────┤
│ Layer 3  WORK PRODUCTS                                        │
│   Patches · Press Releases · Counter-Bills · Manifestos       │
├───────────────────────────────────────────────────────────────┤
│ Layer 2  SHADOW STATE  (mirror of the real government)        │
│   Shadow leader · Ministries · Policy boards                  │
├───────────────────────────────────────────────────────────────┤
│ Layer 1  PARTY ORGANS                                         │
│   Leader · Central committee · Policy councils · Group        │
├───────────────────────────────────────────────────────────────┤
│ Layer 0  CONSTITUTIONAL LAYER  (charter, bylaws, red lines)   │
└───────────────────────────────────────────────────────────────┘
```

The full architecture document lives at [`docs/architecture.md`](./docs/architecture.md).

---

## Core primitives

These are universal — every party that runs on partyclip uses them:

| Primitive | What it is |
|---|---|
| **Constitution** | First-class entities with stable IDs and configurable mutability (immutable, amendable by simple/super majority, amendable only by referendum). Patches cite articles by ID with declared relevance (supporting, tension, opposing). |
| **Patch pipeline** | A configurable state machine. Default stages: drafting → critique → risk assessment → execution → bias review → operator sign-off → published. Stages are separate agent runs. Rejection sends a patch back to drafting with a structured reason. |
| **Patch classification** | Patches are tagged regular, cross-cutting, or constitutional. Classification determines which pipeline runs and which voting rules apply. |
| **Voting** | Internal votes (binary at critic stage, multi-head at cabinet stage) and external advisory votes from registered citizens. Quorum, majority rules, and supermajority thresholds are configurable. |
| **Dissents** | Any agent at any stage can file a dissent. Dissents are first-class entities, attached to the patch, published as minority opinions in the parliamentary tradition. |
| **Bias review** | A dedicated review stage that surfaces epistemological bias in agent output — assumptions inherited from training data that don't match the configured constitution or local context. |
| **Operator sign-off** | The final gate before any artifact reaches the public. Operators can intercept the pipeline at any stage; they can only approve at the end. Overrides of internal votes are recorded, never silenced. |
| **Audit log** | Event-sourced, append-only. Every state change is an event. Current state is a projection over events. Nothing is ever mutated or deleted. |
| **Citizen tiers** | Anonymous, registered (free), supporter (paid). Per-deployment configuration of what each tier sees and can do. Time-delayed access supported natively (e.g., free tier sees earlier-stage outputs after a configurable delay). |
| **Forum ingestion** | Citizen forum threads are processed by a sandboxed ingestor agent — no tools, no host capabilities, structured-output only — that emits typed `FeedbackSummary` artifacts. Other agents read summaries, never raw user input. Prompt-injection-resistant by construction. |
| **Revenue streams** | Subscriptions, donations, dataset access, and arbitrary other streams via a payment-processor plugin contract. Each stream has a transparency level set by the operator with a recorded reason. |
| **Disclaimer system** | A primitive — partyclip enforces that disclaimers can be required at specific placements (footer, every press release, donation flow). Parties supply the text. |

---

## Where party-specific things live

partyclip itself is empty of party content. To run an actual party, three things are configured:

### Content (in a content repository, public or private)

```
constitution/
  charter.md
  articles/
    CONST-K1-A1.md
    CONST-K1-A2.md
    ...
ministries/
  economy/
    ministry.yaml
    architect.md
    analyst.md
    ...
party-organs/
  leader.md
  central-committee.md
  ...
homepage.yaml
branding.yaml
disclaimers/
  ...
```

### Plugins (own repos, published as packages)

Country-specific or party-specific extensions that aren't useful to others. Examples:

- A payment processor plugin for a regional provider
- A scraper plugin for a specific national parliament's website
- A visualization plugin for a specific chart style a party prefers

### Deployment configuration

Database, secrets, domain, processor API keys, model selection, runtime budgets — set per environment.

A reference content repository ([`partyclip-content`](https://github.com/partyclipai/partyclip-content)) demonstrates how a real deployment — the Algoritmik Parodi Partisi (APP) art/research project — configures these. It is one example, not a default. Forks for other parties are encouraged.

---

## Status

Pre-alpha. Not yet runnable end-to-end.

What works today: nothing yet. This README is the first artifact.

What's coming next: the data model, the pipeline runtime, the first plugins (cabinet meeting, news ingestion, public site renderer), and a reference deployment of the Algoritmik Parodi Partisi as a working example.

---

## Built on Paperclip

partyclip began as a fork of [Paperclip](https://github.com/paperclipai/paperclip) — an orchestration platform for AI-agent organizations. Paperclip provides the substrate: agent runtime, heartbeat scheduler, plugin SDK, embedded database, activity log.

partyclip is maintained as an independent repository. We track Paperclip releases manually and merge selected upstream changes on a periodic basis.

**Last synced with Paperclip:** _not yet — initial sync pending_

The party-shaped concepts in partyclip — constitution, patch pipeline, voting, dissents, citizen tiers, revenue streams, forum ingestion, shadow government structure — are not present in Paperclip and live only in this repository.

Generic improvements (agent runtime, plugin SDK, scheduler) may occasionally be contributed back to Paperclip via pull request, separately from this repository.

---

## Contributing

Not yet open to external contributions. The schema and plugin contracts are still moving. Once they stabilize, contribution guidelines, a code of conduct, and a roadmap will appear here.

If you're interested in running partyclip for your own party, project, or research, open an issue describing what you're trying to do — the answers will help shape the v1 plugin API.

---

## License

partyclip is licensed under the MIT License, matching upstream Paperclip. See [LICENSE](./LICENSE).

Content shipped in companion repositories (e.g., `partyclip-content`) may be licensed differently — typically Creative Commons. Check each repository's LICENSE file.

---

## A note on what this isn't

partyclip is not a tool for spreading political content, running campaigns, generating talking points, or amplifying any party's message. It is not designed for persuasion. It is designed for *deliberation* — slow, structured, auditable, and conducted in the open. Deployments that use partyclip to mass-produce campaign material are using the wrong tool, and the framework's emphasis on dissent recording, bias review, and time-delayed transparency will fight them every step of the way. That's intentional.

Build something legible, or don't build it here.
