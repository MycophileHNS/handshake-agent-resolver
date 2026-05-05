export const METADATA_PREFIX = 'agent-identity:v1=';
export const METADATA_PREFIX_RE = /^agent-identity:v([^=]+)=/;
export const HNS_AGENT_PREFIX_RE = /^hns-agent\s*=\s*v([^;\s]+)/i;

export const DEFAULT_LOOKUP_LOCATIONS = [
  '@',
  '_agent',
  '_agent-identity'
];

export const DEFAULT_SKILL_PATHS = [
  '/SKILL.md',
  '/skill.md',
  '/.well-known/agent/SKILL.md'
];

export const IDENTITY_VERSION = 1;
export const MAX_TXT_VALUE_LENGTH = 4096;
export const MAX_STRING_FIELD_LENGTH = 2048;
export const MAX_CAPABILITY_COUNT = 64;
export const MAX_PROTOCOL_COUNT = 64;
export const DEFAULT_SKILL_FETCH_TIMEOUT_MS = 3000;
export const MAX_SKILL_BYTES = 512 * 1024;
