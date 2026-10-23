/**
 * The case studies the home descent opens the cloud on, in order, and the beats each break
 * shows. Every beat is quoted verbatim from its case study (src/content/work/<slug>.md); the
 * figure and result come from the entry's own fields. No new claims.
 */
export interface Featured {
  slug: 'cloud-cost-optimisation' | 'live-migration-to-kubernetes' | 'alert-payload-reduction' | 'karpenter-autoscaling';
  /** One short beat per stage of the drawing, in order. */
  beats: string[];
  /** Alt text for the scene's still. */
  alt: string;
}

export const FEATURED: Featured[] = [
  {
    slug: 'cloud-cost-optimisation',
    beats: [
      'Cloud spend follows the shape of an estate rather than its load.',
      'Right-sized RDS instances and relocated databases, right-sized EC2, and tuned provisioned IOPS down to measured need.',
      'About 40% off the monthly cloud bill, across the total estate — development and production both, not non-production alone.',
    ],
    alt: 'Oversized nodes drawn as white linework with their idle capacity in amber; rightsized, they shrink to fit their pods, and a bill meter falls by 40 per cent.',
  },
  {
    slug: 'live-migration-to-kubernetes',
    beats: [
      'Roughly two terabytes had to move off a non-Kubernetes environment onto Kubernetes-backed services while the applications carried on serving.',
      'DMS ran in two stages: a full load for the bulk, then continuous replication to keep the target in step while the source stayed live.',
      'Roughly 2 TB across a dozen or so databases, moved onto Kubernetes-backed services with the source serving throughout the copy and one planned window at the end of it: stop replication, repoint the endpoints.',
    ],
    alt: 'The source databases on the left and a Kubernetes cluster on the right, joined by a DMS pipe carrying blocks of data; checks pass, and one switch moves the traffic across.',
  },
  {
    slug: 'alert-payload-reduction',
    beats: [
      'An alert has one job: tell whoever is carrying the pager what broke, where, and whether it needs them now.',
      'I have done this twice now, in two different stacks — first in Grafana, later in Coralogix.',
      'Alert payloads more than 50% smaller, and alerts that can be read and triaged from a phone without opening anything else.',
    ],
    alt: 'A bulky alert payload drawn as a tall stack of fields is cut to under half its size and becomes a three-part Slack card, once from Grafana and once from Coralogix.',
  },
  {
    slug: 'karpenter-autoscaling',
    beats: [
      'A pod that cannot be placed waits, and how long it waits is decided entirely by how the cluster gets more capacity.',
      'Took Karpenter from a proof of concept through to every production environment, and retired the Cluster Autoscaler node groups it superseded.',
      'Under load, the cluster scales past 100 nodes in under 10 minutes. Both measured on the running system rather than read off the documentation.',
      'Autoscaling that is not tuned is just a faster way to move workloads you did not want moved.',
    ],
    alt: 'A Kubernetes cluster drawn as white linework on a survey sheet: a pending pod, in amber, waits over an empty lot while a new node is drawn around it, then the field grows past a hundred nodes.',
  },
];
