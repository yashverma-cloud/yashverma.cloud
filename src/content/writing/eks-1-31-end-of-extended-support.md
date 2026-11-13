---
title: 'EKS 1.31 leaves extended support on 26 November'
description: 'After 26 November, EKS upgrades 1.31 control planes without notice or rollback. Nodes and add-ons stay behind.'
published: '2026-11-13'
draft: false
kind: note
---

EKS 1.31 reaches the end of extended support on 26 November, and after that the upgrade is no longer your call.

Every EKS version gets 14 months of standard support and 12 more of paid extended support. When those 26 months are up, AWS upgrades the control plane to the earliest supported version, which for 1.31 means 1.32. The documentation is blunt about timing: it can happen any time after the date, with no notification beforehand, and a cluster upgraded this way cannot be rolled back.

The catch is that only the control plane moves. Managed node groups, self-managed nodes and Fargate pods stay on 1.31, and the add-ons are yours to update. So a forced upgrade leaves you with version skew and a to-do list you did not schedule.

Before taking the 1.32 step yourself, read its release notes. Anonymous access is limited to the health check endpoints, the v1beta3 FlowSchema API is gone, and 1.32 is the last version with Amazon Linux 2 AMIs, so the hop after it means AL2023 or Bottlerocket.

The same clock is running on 1.34, which leaves standard support on 2 December. Running aws eks describe-cluster-versions shows every end date in one call. An upgrade on your own schedule beats one on somebody else's.
