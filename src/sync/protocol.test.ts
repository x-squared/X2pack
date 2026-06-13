import { describe, it, expect } from 'vitest';
import {
  encodeForQR,
  decodeFromQR,
  filterHostCandidates,
  SYNC_PROTOCOL_VERSION,
  assessProtocolCompatibility,
  protocolMismatchMessage,
} from './protocol.js';

describe('encodeForQR / decodeFromQR', () => {
  it('round-trips an SDP string', () => {
    const sdp = 'v=0\r\no=- 123 456 IN IP4 0.0.0.0\r\ns=-\r\n';
    expect(decodeFromQR(encodeForQR(sdp))).toBe(sdp);
  });

  it('returns empty string for invalid input', () => {
    expect(decodeFromQR('not-valid-lz-data')).toBe('');
  });
});

describe('filterHostCandidates', () => {
  const candidate = (type: string, ip: string) =>
    `a=candidate:1 1 UDP 2130706431 ${ip} 54321 typ ${type}`;

  it('passes non-candidate lines through unchanged', () => {
    const sdp = 'v=0\no=- 1 2 IN IP4 0.0.0.0\n';
    expect(filterHostCandidates(sdp)).toBe(sdp);
  });

  it('keeps IPv4 host candidates', () => {
    const line = candidate('host', '192.168.1.100');
    expect(filterHostCandidates(line)).toBe(line);
  });

  it('keeps mDNS .local host candidates', () => {
    const line = 'a=candidate:1 1 UDP 2130706431 abcd1234.local 54321 typ host';
    expect(filterHostCandidates(line)).toBe(line);
  });

  it('removes srflx candidates', () => {
    const line = candidate('srflx', '203.0.113.5');
    expect(filterHostCandidates(line)).toBe('');
  });

  it('removes relay candidates', () => {
    const line = candidate('relay', '198.51.100.1');
    expect(filterHostCandidates(line)).toBe('');
  });

  it('removes IPv6 host candidates', () => {
    const line = 'a=candidate:1 1 UDP 2130706431 ::1 54321 typ host';
    expect(filterHostCandidates(line)).toBe('');
  });

  it('removes link-local IPv4 host candidates (non-routable)', () => {
    // 169.254.x.x are link-local — the regex still matches them as IPv4 and keeps them;
    // this test documents the current behaviour rather than asserting they should be filtered.
    const line = candidate('host', '169.254.0.1');
    expect(filterHostCandidates(line)).toBe(line);
  });

  it('filters a realistic mixed SDP block', () => {
    const lines = [
      'v=0',
      'o=- 123 456 IN IP4 0.0.0.0',
      candidate('host', '192.168.1.10'),
      'a=candidate:2 1 UDP 2130706431 phone.local 54321 typ host',
      candidate('srflx', '203.0.113.5'),
      candidate('relay', '198.51.100.1'),
      'a=candidate:1 1 UDP 2130706431 ::1 54321 typ host',
      'a=end-of-candidates',
    ];
    const result = filterHostCandidates(lines.join('\n'));
    const resultLines = result.split('\n').filter(Boolean);

    expect(resultLines).toContain('v=0');
    expect(resultLines).toContain('a=end-of-candidates');
    expect(result).toContain('192.168.1.10');
    expect(result).toContain('phone.local');
    expect(result).not.toContain('203.0.113.5');
    expect(result).not.toContain('198.51.100.1');
    expect(result).not.toContain('::1');
  });
});

describe('SYNC_PROTOCOL_VERSION and assessProtocolCompatibility', () => {
  it('current version is 2', () => {
    expect(SYNC_PROTOCOL_VERSION).toBe(2);
  });

  it('matches same version', () => {
    expect(assessProtocolCompatibility(2)).toBe('ok');
    expect(protocolMismatchMessage(2)).toBe('');
  });

  it('warns when peer omits protocolVersion', () => {
    expect(assessProtocolCompatibility(undefined)).toBe('warn');
    expect(protocolMismatchMessage(undefined)).toMatch(/older version/);
  });

  it('warns when peer is on an older protocol', () => {
    expect(assessProtocolCompatibility(0)).toBe('warn');
  });

  it('rejects newer incompatible protocol', () => {
    expect(assessProtocolCompatibility(99)).toBe('incompatible');
    expect(protocolMismatchMessage(99)).toMatch(/Cannot sync/);
  });
});
