const { spawn } = require('child_process');

let cfProcess = null;

function cleanup() {
  if (cfProcess) {
    try { cfProcess.kill(); } catch(e) {}
    cfProcess = null;
  }
}
process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function startTunnel(port) {
  cleanup(); // tuer le tunnel precedent avant d'en demarrer un nouveau (fix reconnect)
  return new Promise((resolve, reject) => {
    cfProcess = spawn('cloudflared', [
      'tunnel', '--url', `http://localhost:${port}`
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

    cfProcess.on('error', err =>
      reject(new Error('cloudflared introuvable : ' + err.message))
    );

    // sortie prematuree (code 1, auth manquante, conflit de port...) — rejeter immediatement
    cfProcess.on('close', (code) => {
      if (!resolved) {
        reject(new Error(`cloudflared a quitte prematurement (code ${code})`));
      }
    });

    let output = '';
    let resolved = false;

    cfProcess.stderr.on('data', (data) => {
      if (resolved) return; // ne plus accumuler apres resolution (fix memoire/CPU)
      output += data.toString();
      const m = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        resolved = true;
        console.log('\n\x1b[32m  Tunnel Cloudflare : ' + m[0] + '\x1b[0m');
        console.log('\x1b[90m  Scanne le QR code avec la camera iPhone -> Expo Go\x1b[0m\n');
        resolve(m[0]);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        cleanup(); // tuer le processus zombie (fix timeout)
        reject(new Error('Timeout : URL cloudflared introuvable apres 60s'));
      }
    }, 60000);
  });
}

async function connect(portOrOptions) {
  let port;
  if (typeof portOrOptions === 'object') {
    // addr peut etre "host:port" (ex. "0.0.0.0:8081") — extraire uniquement le port
    const raw = portOrOptions.port || portOrOptions.addr;
    if (typeof raw === 'string' && raw.includes(':')) {
      port = parseInt(raw.split(':').pop(), 10) || 8081;
    } else {
      port = raw || 8081;
    }
  } else {
    port = portOrOptions;
  }
  return startTunnel(port);
}

async function connectAsync(port) { return startTunnel(port); }
async function disconnect() { cleanup(); }
async function disconnectAsync() { cleanup(); }
async function kill() { cleanup(); }
async function killAsync() { cleanup(); }

module.exports = { connect, connectAsync, disconnect, disconnectAsync, kill, killAsync };
