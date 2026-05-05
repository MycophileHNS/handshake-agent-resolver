import {Resolver} from 'node:dns/promises';

const NO_RECORD_CODES = new Set([
  'ENODATA',
  'ENOTFOUND',
  'NOTFOUND'
]);

function isNoRecord(error) {
  return NO_RECORD_CODES.has(error?.code);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export class DnsHandshakeSource {
  constructor(options = {}) {
    this.resolver = options.resolver ?? new Resolver();
    this.servers = options.servers ?? null;

    if (this.servers)
      this.resolver.setServers(this.servers);
  }

  sourceInfo() {
    return {
      type: 'dns',
      servers: this.servers ?? []
    };
  }

  async resolveA(name) {
    try {
      const records = await this.resolver.resolve4(name);

      return {
        status: records.length > 0 ? 'ok' : 'no_records',
        records
      };
    } catch (error) {
      if (isNoRecord(error)) {
        return {
          status: 'no_records',
          records: [],
          code: error.code
        };
      }

      return {
        status: 'error',
        records: [],
        code: error?.code ?? 'A_LOOKUP_ERROR',
        message: error?.message ?? String(error)
      };
    }
  }

  async resolveAAAA(name) {
    try {
      const records = await this.resolver.resolve6(name);

      return {
        status: records.length > 0 ? 'ok' : 'no_records',
        records
      };
    } catch (error) {
      if (isNoRecord(error)) {
        return {
          status: 'no_records',
          records: [],
          code: error.code
        };
      }

      return {
        status: 'error',
        records: [],
        code: error?.code ?? 'AAAA_LOOKUP_ERROR',
        message: error?.message ?? String(error)
      };
    }
  }

  async resolveTxt(name) {
    try {
      const records = await this.resolver.resolveTxt(name);

      if (!records || records.length === 0) {
        return {
          status: 'no_records',
          records: []
        };
      }

      return {
        status: 'ok',
        records
      };
    } catch (error) {
      if (isNoRecord(error)) {
        return {
          status: 'no_records',
          records: [],
          code: error.code
        };
      }

      return {
        status: 'error',
        records: [],
        code: error?.code ?? 'TXT_LOOKUP_ERROR',
        message: error?.message ?? String(error)
      };
    }
  }

  async resolveName(name) {
    const lookups = await Promise.all([
      this.resolveA(name).then((result) => ({recordType: 'A', result})),
      this.resolveAAAA(name).then((result) => ({recordType: 'AAAA', result})),
      this.resolveTxt(name).then((result) => ({recordType: 'TXT', result}))
    ]);
    const a = lookups.find((lookup) => lookup.recordType === 'A').result;
    const aaaa = lookups.find((lookup) => lookup.recordType === 'AAAA').result;
    const txt = lookups.find((lookup) => lookup.recordType === 'TXT').result;
    const records = {
      A: a.records,
      AAAA: aaaa.records,
      TXT: txt.records
    };
    const recordStatus = {
      A: a.status,
      AAAA: aaaa.status,
      TXT: txt.status
    };
    const addresses = unique([...records.A, ...records.AAAA]);
    const hasRecords = addresses.length > 0 || records.TXT.length > 0;
    const errors = lookups
      .filter(({result}) => result.status === 'error')
      .map(({recordType, result}) => ({
        recordType,
        code: result.code,
        message: result.message
      }));

    return {
      status: hasRecords ? 'ok' : (errors.length > 0 ? 'lookup_error' : 'no_records'),
      resolved: addresses.length > 0,
      addresses,
      address: addresses[0] ?? null,
      recordType: records.A.length > 0
        ? 'A'
        : (records.AAAA.length > 0 ? 'AAAA' : null),
      records,
      recordStatus,
      source: this.sourceInfo(),
      errors
    };
  }
}
