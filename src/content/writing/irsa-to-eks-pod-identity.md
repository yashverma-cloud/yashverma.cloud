---
title: 'Two ways for a pod to get AWS permissions'
description: 'Swapping IAM Roles for Service Accounts for EKS Pod Identity cut the IAM setup for a new workload from a long checklist to a couple of API calls.'
published: '2026-10-11'
draft: false
kind: note
---

Swapping IAM Roles for Service Accounts for EKS Pod Identity cut the IAM setup for a new workload from a long checklist to a couple of API calls.

For years, giving a Kubernetes pod AWS permissions meant IRSA: set up an OIDC identity provider for the cluster, write a trust policy that matches a service account's namespace and name exactly, and keep that mapping in sync every time something changed. It worked, but it was easy to get a trust policy subtly wrong and not notice until someone went looking.

EKS Pod Identity, which AWS has steadily matured since its 2023 launch, replaces that OIDC dance with a direct association: you link an IAM role to a service account through the EKS Auth API, and the Pod Identity Agent running on each node handles credential vending. No per-cluster OIDC provider to manage, no manual trust policy wrangling, and the same IAM role can be reused across clusters without re-establishing federation each time.

I've been migrating workloads over gradually rather than in one pass, since IRSA and Pod Identity can coexist on the same cluster. For anyone running EKS fleets with growing IAM surface area, it's worth checking whether your newer workloads are still defaulting to IRSA out of habit.
