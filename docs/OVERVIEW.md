---
id: IDX-OVERVIEW-EN
type: index
status: active
scope: documentation
authority: navigation
---

# Overview in English

This page explains the ideas behind the rules package
`@apocarteres/project-conventions` for readers who do not read Russian. The
normative texts it refers to are in Russian, in [requirements](requirements/);
each idea below names the requirement that defines it, so the text can be
looked up and machine-translated when the details matter.

The package does not depend on the project's stack. A project in any language
can adopt the rules alone; the Java and Angular libraries of the core are an
optional offer.

## Requirements and clause IDs

Every rule is a numbered clause with a stable ID, such as `REQ-QUALITY-007`.
The texts ship inside the package, and `conventions sync` writes a block into
the project's `AGENTS.md` that points to them, so a person or an agent reads
the actual rules locally. Code, tests and tickets cite clause IDs, and the
documentation check refuses metadata that points to a document that does not
exist.
Each requirement states its level: a **directive** must be followed and fails
the check, a **recommendation** is reported without failing it
(`REQ-PROJECT-RULES-012`…`015`). A project can add its own rules but cannot
weaken the core's.

## Checks: check and verify

There are exactly two suites with fixed names (`REQ-QUALITY-001`): `check`,
a fast gate run before every push, and `verify`, everything that can be
checked locally, including integration tests and builds. A `pre-push` hook
runs `check` or requires proof that `verify` passed (`REQ-QUALITY-004`). A
failed check names the file, the place and the clause, and when the project
cannot fix the cause itself, the way to report it to the core.

## Baseline

When rules are adopted, existing violations are recorded once in
`.conventions/baseline.json` (`REQ-QUALITY-007`). From then on, the count per
file may only go down: a new violation fails the check, and fewer violations
prompt lowering the baseline with `conventions baseline`. Raising it requires
an explicit `--allow-growth`. Adoption does not require clean code; it
requires that the debt stops growing.

## Receipts

"Tests passed" is a file, not a statement. `conventions receipt --checks
check,verify -- <command>` runs the suite and, only if it succeeds, writes a
receipt for the exact code tree of the commit (`REQ-RELEASE-027`). The push
gate (`conventions attested`) and the release accept only a receipt for the
same tree; a commit that changes only documentation carries the receipt over.

## Release cycle

A release is a document in `docs/releases` and a tag (`REQ-RELEASE`).
`conventions release open` starts it with the tickets it will ship;
`conventions release close` closes it only with a receipt for the released
commit, with every commit since the previous release attributed to a ticket,
and with the core's obligations handled; `release finish` records the final
step and the tag. Breaking changes of the core are major versions with a
migration section, and `conventions upgrade-report --from X.Y.Z` lists what
each release since then breaks, adds or obliges.

## Obligations

The core can oblige its consumers: an obligation names a requirement and a
deadline counted in the consumer's own releases (`REQ-RELEASE-012`…`015`).
Opening a release turns each pending obligation into a ticket in the
consumer's repository. An obligation is closed by a ticket, including a ticket that
explains why it does not apply, or postponed with a recorded reason; an
overdue one fails the check. `conventions obligations` shows the state of each.

## Tickets

Tickets are Markdown files with metadata in `docs/tickets`
(`REQ-TICKETS`): an ID with the project's prefix, an area and a number, a
problem, what confirms it, the consequences of doing nothing, what is
required and how it is accepted. A hypothesis is marked as one. Commit
messages start with a ticket ID, and indexes of tickets and releases are
generated, not written by hand.

## Stack

A project declares its stack in `.conventions.json`: `"stack": ["java",
"angular", "rust"]` in any combination, or `"stack": []` for the rules alone
(`REQ-ADOPTION-028`). Obligations labelled with a stack apply only to projects
that declared it. The declaration is checked against build files: a
`pom.xml`, `build.gradle`, `angular.json` or `Cargo.toml` of an undeclared
stack fails the check.

## Agents

The rules are written to be followed by coding agents as well as people
(`REQ-AGENT-WORK`): confirm a hypothesis before changing code; prove a fix by
the failure before it and its absence after; run commands with an overall and
an idle time limit (`conventions run`); read a check's exit code directly,
not through a pipe; and stop to ask before anything irreversible or outward
facing, such as a release, a push to a shared branch or a published answer.

## Reports

A consumer reports a defect of the core, or a rule it ran into, as an issue
using the template, with the core version, what confirms it, a link to its
own ticket and the expected result (`REQ-ADOPTION-019`). The issue gets an
answer before the next core release closes: a core ticket or a refusal with a
reason (`REQ-ADOPTION-020`). A project with consumers of its own can offer
them the same channel with `conventions feedback-template`
(`REQ-ADOPTION-027`). Vulnerabilities are reported privately; see
[SECURITY.md](../SECURITY.md).
