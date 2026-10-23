---
title: 'Jarvis: safe cluster access from Slack'
result: 'cluster operations without leaving Slack'
mechanism: 'Slack bot with verified requests, role-scoped commands and an audit channel'
order: 5
draft: false
---

## Problem

Everyone who ships to a cluster needs to know what it is doing. Is the pod up, did the
deploy land, what do the logs say.

Very few of them should be holding credentials to a production cluster. Both of those are
true at once, and the gap between them gets filled by asking somebody who does have access —
which costs the asker a context switch every time, and answers a question they could have
answered themselves.

## What I did

Built Jarvis: a Slack bot, in Python and Flask, that holds the cluster access so the people
using it don't have to. It runs inside the cluster itself, as a pod in its own namespace.

Authorisation is decided per command rather than per user session, and it is checked in four
places before anything reaches the cluster:

- **The request is really from Slack.** Every call has its Slack signature and timestamp
  verified, so the endpoint cannot be driven by anything else that finds the URL.
- **The caller is somebody.** The Slack user ID is resolved to an email and matched against
  two lists held in config — one for everyone allowed to use the bot, one for admins.
- **The command is allowed for that caller.** Developers and QA read state: pods,
  deployments, and the most recent logs for any pod. Admins get the commands that change
  something — rollout restarts, scaling replicas, and resuming a frozen release window when
  something has to ship in an emergency.
- **The command is well formed.** Input is sanitised and the destructive verbs are simply
  not reachable; there is no path through the bot that deletes or edits a resource.

Underneath, it holds an RBAC-limited service account rather than cluster-admin, so the
ceiling on the whole thing is set by Kubernetes and not only by my own checks. Requests are
rate limited per user, and long output is truncated rather than dumped into a channel.

Everything is logged, and every action is echoed into its own Slack channel as it happens.
An audit trail nobody opens is not much of an audit trail; in a channel, who ran what is
simply visible.

That split is the design. The feature list is deliberately short; the part worth talking
about is that the blast radius of a Slack message is bounded by who sent it.

## Result

Developers and QA answer their own questions about the cluster without holding access to it,
and without waiting on somebody who does.

And because Slack is already on everyone's phone, scaling replicas in an emergency — or
releasing a frozen window — stopped requiring being at a machine.
