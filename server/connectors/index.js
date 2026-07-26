import { health } from './health.js';
import { instagram } from './instagram.js';
import { analytics, reviews } from './pending.js';
import { siteStats } from './site-stats.js';

/** Panoda görünme sırası. */
export const CONNECTORS = [siteStats, health, instagram, analytics, reviews];

export { runAll, runConnector, Unconfigured } from './runner.js';
