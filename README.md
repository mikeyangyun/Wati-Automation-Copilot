# Wati Automation Builder Copilot

> AI-assisted design and pre-launch validation for Wati chatbot automations.

---

## Status

**Pre-implementation.** This README captures the planned product, architecture, and API surface. The runtime scaffold (server, web, shared packages) is not yet in place; a Quick Start section will be added once the project boots.

For the product specification, see [PRODUCT.md](./PRODUCT.md).

---

## Overview

**Wati Automation Builder Copilot** lets operators describe a chatbot automation in plain English and turns it into a Wati-compatible flow. The system explains the resulting logic, reviews it for defects and gaps, and runs a deterministic mock conversation so the design can be walked through before any flow is published.

The Copilot sits **upstream of publish** — design and validate first, then configure the approved flow in the Wati Builder.

**Primary users:** customer operations and CS leads, plus small business owners configuring routing and FAQ bots.

---

## Scope

| In scope (MVP) | Out of scope (MVP) |
|----------------|--------------------|
| Natural-language input with starter examples | Drag-and-drop visual editor |
| Generation of a Wati-style flow from a brief | Publish or deploy to live channels |
| Read-only node graph + structured flow view | Wati API / WhatsApp integration |
| AI: generate, explain, review | Accounts, login, saved workflows |
| Multi-turn mock simulation with fallback and reset | Persistent storage and flow library |
| Hybrid review (structural + AI semantic) | AI-authored runtime chat replies |

See [PRODUCT.md](./PRODUCT.md) for full details and rationale.
