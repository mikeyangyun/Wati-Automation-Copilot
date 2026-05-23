# Wati Automation Builder Copilot

> AI-assisted design and pre-launch validation for Wati chatbot automations.

---

## Status

**Pre-implementation.** This README captures the planned product, architecture, and API surface. The runtime scaffold (server, web, shared packages) is not yet in place; a Quick Start section will be added once the project boots.

For the product specification, see [PRODUCT.md](./PRODUCT.md).

---

## Overview

Wati customers configure chatbot automations in the Wati Chatbot Builder by wiring nodes — questions, conditions, branches, team handoffs. Operators usually know *what* the bot should do, but not how to express it as a node graph.

**Wati Automation Builder Copilot** lets operators describe the automation in plain English. The system:

- Generates a Wati-compatible flow from a natural-language brief.
- Explains the resulting logic in plain language.
- Reviews the flow for structural defects and semantic gaps.
- Runs a deterministic mock conversation so the operator can walk the flow before going live.

The Copilot sits **upstream of publish** — design and validate first, then configure the approved flow in the Wati Builder. Nothing in this product touches a live WhatsApp channel.

**Primary users:** customer operations and CS leads who configure routing and FAQ bots, plus small business owners setting up first-line automations.

---

## Out of Scope (MVP)

The product focuses on AI-assisted design and pre-launch validation. The following are explicitly excluded from the MVP:

- Drag-and-drop visual editor
- Publish or deploy to live channels
- Wati API / WhatsApp integration
- Accounts, login, and saved workflows
- Persistent storage and long-term flow library
- AI-authored runtime chat replies

See [PRODUCT.md §2](./PRODUCT.md) for the full in-scope and out-of-scope breakdown.
