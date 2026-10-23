---
title: 'Node autoscaling that keeps up with load'
figure: '80s'
result: 'from pending pod to a ready node'
mechanism: 'Karpenter in place of fixed node groups, tuned against observed behaviour'
order: 4
draft: false
---

## Problem

Node capacity is a scheduling problem with a clock on it. A pod that cannot be placed
waits, and how long it waits is decided entirely by how the cluster gets more capacity.

Managed node groups answer that by declaring the shapes in advance. It is predictable, and
predictability is worth a lot. It also means a pod that does not fit the declared shapes is
waiting on a group that has to exist before the pod does, and that each environment carries
the capacity its groups imply rather than the capacity its workloads are asking for right
now.

## What I did

Took Karpenter from a proof of concept through to every production environment, and retired
the Cluster Autoscaler node groups it superseded.

Installing it was the short part. Most of the work was what came after, because a
controller that adds and removes capacity on its own will do exactly that, and its defaults
have no way of knowing which of your workloads mind being moved. So I ran it, watched what
it actually did, and tuned it against that rather than against a recommended starting
point:

- PodDisruptionBudgets, set per workload rather than globally.
- `do-not-disrupt` annotations on the pods that must not be moved mid-flight.
- Disruption policy and timings on the NodeClaims themselves — when a node may be replaced,
  and how long one is allowed to live.

Each of those was changed against observed behaviour and then watched again. Autoscaling
that is not tuned is just a faster way to move workloads you did not want moved.

## Result

A pending pod gets a ready node in about 80 seconds. Under load, the cluster scales past
100 nodes in under 10 minutes. Both measured on the running system rather than read off the
documentation.

The scene at the top of this site is the same idea, drawn: take a node away, its pods are
rescheduled onto capacity that already exists, and a replacement is provisioned behind
them. The difference is that the drawing recovers in eight seconds, because you are
standing there watching it.
