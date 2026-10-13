import { describe, expect, it } from 'vitest';
import { parseSmbStatus } from '../src/server/smbstatus';

const SAMPLE = `Samba version 4.19.5-Ubuntu
PID     Username     Group        Machine                                   Protocol Version  Encryption           Signing
------------------------------------------------------------------------------------------------------------------------------------
1234    alice        alice        192.168.1.50 (ipv4:192.168.1.50:52344)    SMB3_11           AES-128-GCM          AES-128-GMAC
5678    bob          users        192.168.1.60 (ipv4:192.168.1.60:49812)    SMB3_11           -                    AES-128-CMAC

Service      pid     Machine       Connected at                     Encryption   Signing
---------------------------------------------------------------------------------------------
data         1234    192.168.1.50  Tue Oct 13 04:00:00 2026 UTC     AES-128-GCM  AES-128-GMAC
media        5678    192.168.1.60  Tue Oct 13 04:05:00 2026 UTC     -            AES-128-CMAC

Locked files:
Pid          User(ID)     DenyMode   Access      R/W        Oplock           SharePath   Name   Time
--------------------------------------------------------------------------------------------------
1234         alice(1000)  DENY_NONE  0x120089    RDONLY     NONE             /srv/data   docs/report.docx   Tue Oct 13 04:01:00 2026
`;

describe('parseSmbStatus', () => {
  it('parses sessions, services and locked files', () => {
    const result = parseSmbStatus(SAMPLE);

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]).toEqual({
      pid: '1234',
      username: 'alice',
      group: 'alice',
      client: '192.168.1.50',
      protocol: 'SMB3_11',
      encryption: 'AES-128-GCM          AES-128-GMAC',
    });
    expect(result.sessions[1].client).toBe('192.168.1.60');

    expect(result.services).toHaveLength(2);
    expect(result.services[0]).toMatchObject({
      service: 'data',
      pid: '1234',
      machine: '192.168.1.50',
      connectedAt: 'Tue Oct 13 04:00:00 2026 UTC',
      encryption: 'AES-128-GCM',
      signing: 'AES-128-GMAC',
    });

    expect(result.lockedFiles).toHaveLength(1);
    expect(result.lockedFiles[0]).toMatchObject({
      pid: '1234',
      user: 'alice(1000)',
      denyMode: 'DENY_NONE',
      access: '0x120089',
      rw: 'RDONLY',
      oplock: 'NONE',
      sharePath: '/srv/data',
      name: 'docs/report.docx',
      time: 'Tue Oct 13 04:01:00 2026',
    });
  });

  it('returns empty collections for empty input', () => {
    expect(parseSmbStatus('')).toEqual({ sessions: [], services: [], lockedFiles: [] });
  });

  it('ignores section headers and separator rows', () => {
    const onlyHeaders = SAMPLE.split('\n')
      .filter((line) => /^(PID|Service|Pid)/.test(line) || /^-+$/.test(line) || line.startsWith('Locked files'))
      .join('\n');
    const result = parseSmbStatus(onlyHeaders);
    expect(result.sessions).toHaveLength(0);
    expect(result.services).toHaveLength(0);
    expect(result.lockedFiles).toHaveLength(0);
  });

  it('tolerates CRLF line endings', () => {
    const result = parseSmbStatus(SAMPLE.replace(/\n/g, '\r\n'));
    expect(result.sessions).toHaveLength(2);
    expect(result.lockedFiles).toHaveLength(1);
  });
});
