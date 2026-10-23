---
title: 'Cutting 40% off the monthly cloud bill'
figure: '40%'
result: 'cut off the monthly cloud bill'
mechanism: 'Kubernetes rightsizing, HPA, infrastructure audits'
order: 1
draft: false
---

## Problem

Cloud spend follows the shape of an estate rather than its load. Storage keeps whatever it
is given. Non-production environments get sized like production, because that is the safe
default. Instance families outlive the workloads they were picked for, and a database that
was sized once stays that size until somebody measures it again.

Taking money out of that without taking capacity away from anyone is the constraint.
Developers need the environments they have, when they need them, and production needs
headroom it can actually use.

## What I did

Treated it as an estate-wide exercise rather than a hunt for one large line item.

- Right-sized RDS instances and relocated databases, right-sized EC2, and tuned provisioned
  IOPS down to measured need.
- Put S3 lifecycle rules and database archiving behind data that had to be retained rather
  than read.
- Scheduled non-production to scale down overnight and at weekends, with a self-service path
  so a developer can bring an environment straight back up without going through me.

The same approach more recently, on a different estate: databases and node pools
right-sized against measured load, compute-bound workloads moved onto compute-optimised
instances, and service quotas kept in line with what each environment actually runs, in
both directions.

Keeping it down is a separate job from getting it down, so an alert fires whenever an
instance or an RDS size changes. A resize is then visible on the day it happens rather than
in the next bill.

## Result

About 40% off the monthly cloud bill, across the total estate — development and production
both, not non-production alone.

There are no absolute figures on this page on purpose. A percentage next to the mechanism
that produced it is the part worth discussing; an employer's actual bill is not mine to
publish.
