#!/usr/bin/env node

const { spawn } = require('child_process');

const args = process.argv.slice(2);
const wantsMobile = args.includes('--mobile') || args.includes('-m');
const wantsWeb = wantsMobile || args.includes('--web') || args.length === 0;

const run = (command, options = {}) => {
  const child = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  child.on('exit', code => {
    if (code !== 0) {
      process.exit(code);
    }
  });

  return child;
};

const processes = [];

if (wantsWeb) {
  processes.push(
    run(['npm', 'run', 'dev:web'])
  );
}

if (wantsMobile) {
  const mobileArgsIndex = args.findIndex(arg => arg === '--mobile' || arg === '-m');
  const deviceArg = args[mobileArgsIndex + 1] && !args[mobileArgsIndex + 1].startsWith('-')
    ? args[mobileArgsIndex + 1]
    : 'iPhone 16 Plus';

  processes.push(
    run(['npm', 'run', 'ios', '--', '--device', deviceArg], { cwd: 'apps/mobile' })
  );
}

process.on('SIGINT', () => {
  processes.forEach(proc => proc.kill('SIGINT'));
  process.exit();
});
