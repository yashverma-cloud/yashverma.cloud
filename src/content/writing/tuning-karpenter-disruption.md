---
title: 'Installing Karpenter was the short part'
description: 'Karpenter now gives a pending pod a ready node in about 80 seconds. Installing it was quick; most of the work was teaching it what not to move.'
published: '2026-09-27'
draft: true
---

I took Karpenter from a proof of concept through to every production environment, and retired
the Cluster Autoscaler node groups it superseded. The result I can put a number on is speed: a
pod that cannot be placed gets a ready node in about 80 seconds. The part that took the time was
something else.

## What a node group decides in advance

When a pod cannot be placed, it waits. How long it waits comes down to one thing: how the
cluster gets more capacity.

Managed node groups settle that ahead of time. You declare the shapes, and the autoscaler grows
or shrinks the groups you declared. That is predictable, and predictability is worth a lot. The
cost is that a pod which fits none of the declared shapes waits on a group that has to exist
first, and each environment carries the capacity its groups imply rather than the capacity its
workloads are asking for right now.

Karpenter starts from the other end. It looks at the pods that cannot be scheduled and
provisions a node for them.

## A controller that moves things on its own

That freedom cuts both ways. Karpenter does not only add capacity; it also removes and replaces
nodes by itself. Its defaults have no way of knowing which of your workloads mind being moved.

So installing it was the short part. The work was telling it what mattered, in three places:

- PodDisruptionBudgets, set per workload rather than globally.
- `do-not-disrupt` annotations on the pods that must not be moved mid-flight.
- Disruption policy and timings on the NodePools and NodeClaims: when a node may be replaced,
  and how long one is allowed to live.

## Tuning against behaviour, not a starting point

Every one of those settings has a recommended starting point. I did not tune against it. I ran
Karpenter, watched what it actually did to the workloads, changed the settings against what I
saw, and watched again.

That loop is the job. Autoscaling that is not tuned is just a faster way to move workloads you
did not want moved.

## Where it landed

Two numbers, both measured on the running system rather than read off the documentation:

- About 80 seconds from a pending pod to a ready node.
- Past 100 nodes in under 10 minutes, under load.

The speed is the part that fits in a number. The tuning is the part that decides whether you
want that speed in production.
