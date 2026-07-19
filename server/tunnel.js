import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';

function cleanError(value) {
  return String(value || '')
    .replace(/(password|token|secret)\s*[:=]\s*\S+/gi, '$1=[gizlendi]')
    .trim()
    .slice(-500);
}

export function probePort(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export class TunnelManager {
  constructor(config) {
    this.config = config;
    this.process = null;
    this.state = config.sshEnabled ? 'disconnected' : 'direct';
    this.error = '';
    this.startedAt = null;
  }

  status() {
    return {
      mode: this.config.sshEnabled ? 'ssh' : 'direct',
      state: this.state,
      error: this.error,
      startedAt: this.startedAt,
      localPort: new URL(this.config.remoteAdminBaseUrl).port,
    };
  }

  validate() {
    if (!this.config.sshEnabled) return;
    if (!this.config.sshHost || !this.config.sshUser) {
      throw new Error('SSH_HOST ve SSH_USER yapılandırılmamış.');
    }
    if (!this.config.sshKeyPath || !existsSync(this.config.sshKeyPath)) {
      throw new Error('SSH_KEY_PATH bulunamadı.');
    }
    if (!this.config.sshKnownHostsPath || !existsSync(this.config.sshKnownHostsPath)) {
      throw new Error('SSH_KNOWN_HOSTS_PATH bulunamadı; güvenli bağlantı için zorunludur.');
    }
  }

  async start() {
    if (!this.config.sshEnabled) {
      const target = new URL(this.config.remoteAdminBaseUrl);
      const reachable = await probePort(target.hostname, Number(target.port || 80));
      this.state = reachable ? 'direct' : 'unreachable';
      if (!reachable) throw new Error('Lokal geliştirme API’sine ulaşılamıyor.');
      return this.status();
    }
    if (this.process && !this.process.killed) return this.status();
    this.validate();
    this.state = 'connecting';
    this.error = '';

    const forward = `127.0.0.1:${this.config.localTunnelPort}:${this.config.remoteAdminHost}:${this.config.remoteAdminPort}`;
    const destination = `${this.config.sshUser}@${this.config.sshHost}`;
    const args = [
      '-N', '-T', '-L', forward,
      '-p', String(this.config.sshPort),
      '-i', this.config.sshKeyPath,
      '-o', 'BatchMode=yes',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${this.config.sshKnownHostsPath}`,
      destination,
    ];

    const child = spawn('ssh', args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.process = child;
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = cleanError(`${stderr}${chunk}`); });
    child.once('error', (error) => {
      this.error = cleanError(error.message);
      this.state = 'error';
      this.process = null;
    });
    child.once('exit', (code) => {
      if (this.process !== child) return;
      this.error = code === 0 ? '' : cleanError(stderr || `SSH işlemi ${code} koduyla kapandı.`);
      this.state = code === 0 ? 'disconnected' : 'error';
      this.process = null;
    });

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (this.state === 'error') throw new Error(this.error || 'SSH tüneli açılamadı.');
      if (await probePort('127.0.0.1', this.config.localTunnelPort, 500)) {
        this.state = 'connected';
        this.startedAt = new Date().toISOString();
        return this.status();
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await this.stop();
    this.state = 'error';
    this.error = cleanError(stderr || 'SSH tüneli zaman aşımına uğradı.');
    throw new Error(this.error);
  }

  async stop() {
    const child = this.process;
    this.process = null;
    if (child && !child.killed) child.kill();
    this.state = this.config.sshEnabled ? 'disconnected' : 'direct';
    this.error = '';
    this.startedAt = null;
    return this.status();
  }
}

