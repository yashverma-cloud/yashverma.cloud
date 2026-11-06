---
title: 'Security Hub now keeps a software inventory'
description: 'AWS Security Hub now keeps an inventory of the software installed across your compute.'
published: '2026-11-06'
draft: false
kind: note
---

AWS Security Hub now keeps an inventory of the software installed across your compute.

Announced today, the SBOM inventory gives a central security team one organization-wide view of the packages and applications on their compute resources. Security Hub builds it from the software bills of materials Amazon Inspector already generates for EC2 instances, ECR container images and Lambda functions. There is nothing new to enable: it fills in wherever Inspector is on.

The SBOM page lists each package with its version, its type and how many resources it is installed on, and you can filter or group by account and region. Each resource also gets an Installed software tab, and the same inventory can be queried through the Security Hub API.

The useful shift is the question it answers. A findings list says what is vulnerable. An inventory says where it runs. When a widely used library has a bad week, the first hour goes into fixing, not into working out which accounts are affected.

It is included with Security Hub Essentials at no additional cost. If Inspector is not yet covering all your accounts, that is the part to sort out first.
