export {AgentIdentityResolver, resolveAgentIdentity} from './resolver.js';
export {normalizeHandshakeName, buildLookupNames} from './name.js';
export {parseTxtRecords} from './metadata/parse.js';
export {
  normalizeCapabilities,
  normalizeProtocols,
  validateAgentIdentityMetadata
} from './metadata/schema.js';
export {buildSkillCandidates} from './skill-paths.js';
export {discoverSkillMd} from './skill-fetch.js';
export {parseSkillMd} from './skill-parse.js';
export {DnsHandshakeSource} from './upstream/dns-source.js';
export {MockHandshakeSource} from './upstream/mock-source.js';
