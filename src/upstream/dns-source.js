import {Resolver} from 'node:dns/promises';

function isNoRecord(error) {
  return error?.code === 'ENODATA' || error?.code === 'ENOTFOUND';
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
    const [a, aaaa, txt] = await Promise.all([
      this.resolveA(name),
      this.resolveAAAA(name),
      this.resolveTxt(name)
    ]);
    const records = {
      A: a.records,
      AAAA: aaaa.records,
      TXT: txt.records
    };
    const addresses = unique([...records.A, ...records.AAAA]);
    const errors = [a, aaaa, txt]
      .filter((result) => result.status === 'error')
      .map((result) => ({
        code: result.code,
        message: result.message
      }));

    return {
      status: addresses.length > 0 || records.TXT.length > 0 ? 'ok' : 'no_records',
      resolved: addresses.length > 0,
      addresses,
      address: addresses[0] ?? null,
      recordType: records.A.length > 0
        ? 'A'
        : (records.AAAA.length > 0 ? 'AAAA' : null),
      records,
      source: this.sourceInfo(),
      errors
    };
  }
}
