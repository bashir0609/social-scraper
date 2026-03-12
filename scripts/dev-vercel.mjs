import { spawn } from 'node:child_process';

const extraArgs = process.argv.slice(2);
const isWin = process.platform === 'win32';
const command = isWin ? 'cmd.exe' : 'npx';
const args = isWin
  ? ['/d', '/s', '/c', 'npx --yes vercel dev --listen 8888 --yes']
  : ['--yes', 'vercel', 'dev', '--listen', '8888', '--yes', ...extraArgs];

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
  windowsVerbatimArguments: isWin,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
