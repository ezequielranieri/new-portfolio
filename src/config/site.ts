/**
 * Site configuration — single source of truth for the domain and metadata.
 * All internal links should be relative. External links use this URL for canonical/OG.
 */
export const SITE_URL = 'https://ezequielranieri.vercel.app';
export const SITE_NAME = 'Ezequiel Ranieri';
export const SITE_DESCRIPTION = 'AI Security Engineer building backend & security infrastructure for AI agents: Secure AI Agents, Non-Human Identity, IAM, distributed systems, and capability-based security.';

// Social profile URLs — update these when you have real profiles
export const SOCIAL = {
  github: 'https://github.com/ezequielranieri',
  linkedin: 'https://linkedin.com/in/ezequielranieri',
  x: 'https://x.com/ezequielranieri',
  email: 'mailto:ezequielranieri.contact@gmail.com',
};

// Project repo URLs — update if private/404
export const PROJECT_REPOS = {
  aegis: 'https://github.com/ezequielranieri/aegis',
  agentGateway: 'https://github.com/ezequielranieri/agent-gateway',
  mettle: 'https://github.com/ezequielranieri/mettle',
  allProjects: 'https://github.com/ezequielranieri?tab=repositories',
};

// Blog configuration
export const BLOG = {
  postsPerPage: 10,
  readingTimeWordsPerMinute: 200,
};

// Contact
export const CONTACT_EMAIL = 'ezequielranieri.contact@gmail.com';
export const CONTACT_LOCATION = 'Salto Grande, Santa Fe, Argentina';