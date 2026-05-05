function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeValue(value) {
  if (value == null) {
    return {
      A: [],
      AAAA: [],
      TXT: []
    };
  }

  if (Array.isArray(value)) {
    return {
      A: [],
      AAAA: [],
      TXT: value
    };
  }

  return {
    A: value.A ?? [],
    AAAA: value.AAAA ?? [],
    TXT: value.TXT ?? value.records ?? []
  };
}

export class MockHandshakeSource {
  constructor(recordsByName = {}) {
    this.recordsByName = new Map(Object.entries(recordsByName));
    this.requests = [];
    this.addressRequests = [];
    this.nameRequests = [];
  }

  sourceInfo() {
    return {
      type: 'mock',
      servers: []
    };
  }

  getValue(name) {
    if (!this.recordsByName.has(name))
      return null;

    return this.recordsByName.get(name);
  }

  async resolveTxt(name) {
    this.requests.push(name);

    const value = this.getValue(name);

    if (value instanceof Error) {
      return {
        status: 'error',
        records: [],
        code: value.code ?? 'TXT_LOOKUP_ERROR',
        message: value.message
      };
    }

    const records = normalizeValue(value).TXT;

    return {
      status: records.length > 0 ? 'ok' : 'no_records',
      records
    };
  }

  async resolveName(name) {
    this.nameRequests.push(name);

    const value = this.getValue(name);

    if (value instanceof Error) {
      return {
        status: 'error',
        resolved: false,
        addresses: [],
        address: null,
        recordType: null,
        records: {
          A: [],
          AAAA: [],
          TXT: []
        },
        source: this.sourceInfo(),
        errors: [{
          code: value.code ?? 'LOOKUP_ERROR',
          message: value.message
        }]
      };
    }

    const records = normalizeValue(value);
    const addresses = unique([...records.A, ...records.AAAA]);

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
      errors: []
    };
  }
}
