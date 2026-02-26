#!/usr/bin/env node
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import readline from 'readline';
import { create } from 'browser-sync';
import { execSync as exec } from 'child_process';
import { sassPlugin as styles } from 'esbuild-sass-plugin';
import * as sass from 'sass';

const cwd = process.cwd();
const src = path.resolve(cwd, 'src');
const server = create();
const command = process.argv[2];

if (!['build', 'watch'].includes(command)) {
  console.log(`Invalid command: ${chalk.red(command)}\n`);
  process.exit(1);
}

const logger = (options = {}) => ({
  name: 'logger',
  setup(context) {

    const path = context.initialOptions.outdir;
    const slug = Object.keys(context.initialOptions.entryPoints)[0];

    context.onStart(() => {
      server.instance.active && server.info();
    });

    context.onEnd(result => {

      if (result.warnings.length || result.errors.length) {
        console.log('\x07');
        return;
      }

      const css = `${path}/${slug}.css`;
      const js = `${path}/${slug}.js`;

      console.log(`  ${chalk.green('✓')} ${css} ${Math.round(fs.statSync(css).size / 1000)} KB`);
      console.log(`  ${chalk.green('✓')} ${js} ${Math.round(fs.statSync(js).size / 1000)} KB`);
      console.log();
    });
  }
});

const buildOptions = {
  entryPoints: {'main.min': src},
  alias: {'~': src},
  outdir: 'build',
  bundle: true,
  minify: true,
  target: 'es2019',
  external: 'jpg,jpeg,webp,png,gif,svg,woff,woff2'.split(',').map(ext => `*.${ext}`),
  logLevel: 'warning',
  sourcemap: false,
  treeShaking: true,
  legalComments: 'none',
  loader: {
    '.glsl': 'text',
    '.vert': 'text',
    '.frag': 'text',
  },
  plugins: [
    styles({sourceMap: false}),
    logger()
  ]
};

const watchOptions = Object.assign({}, buildOptions, {
  entryPoints: {'main.dev': src},
  minify: false,
  logLevel: 'silent',
  sourcemap: 'inline',
  plugins: [
    styles({sourceMap: true, logger: sass.Logger.silent})
  ]
});

const serveOptions = {
  proxy: `${process.env.npm_package_name}.test`,
  files: ['assets/**', 'build/*', '**/*.php', '**/*.html'],
  host: 'localhost',
  open: false,
  notify: false,
  logLevel: 'silent',
  injectChanges: false,
  ui: false,
};

server.info = function() {
  const proxying = this.url();
  const external = this.getOption('urls').get('external');

  console.clear();
  console.log();
  console.log(`  ➜ ${chalk.bold('Proxying')}: ${chalk.green(proxying)}`);
  console.log(`  ➜ ${chalk.bold('External')}: ${chalk.cyan(external || 'offline')}\n`);
  console.log(`  ${chalk.bold('Shortcuts')}`);

  for (const [key, [_, tip]] of Object.entries(shortcuts)) {
    tip && console.log(chalk.grey(`  press ${chalk.white.bold(key)} to ${tip}`));
  }

  console.log();
};

server.url = function() {
  const host = this.getOption('proxy').get('target');
  const port = this.getOption('port');
  return `${host}:${port}`;
};

const shortcuts = {
  o: [() => exec(`open ${server.url()}`), 'open in browser'],
  r: [() => server.reload(), 'reload the page'],
  q: [() => process.exit(), 'quit'],
  '\x03': [() => process.exit()],
};

async function main() {

  const watcher = await esbuild.context(watchOptions);
  const builder = await esbuild.context(buildOptions);

  if (command === 'build') {
    await watcher.rebuild();
    await builder.rebuild();
    process.exit();
  }

  server.init(serveOptions, () => {
    builder.watch();
    watcher.watch();
    readline.emitKeypressEvents(process.stdin);

    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (_, key) => {
      if (!key) return;
      shortcuts[key.sequence]?.[0]();
    });
  });
}

if (process.argv[3]) {

  const file = process.argv[3];

  if (!fs.existsSync(file)) {
    console.log(`Config file not found: ${chalk.red(file)}\n`);
    process.exit(1);
  }

  function extend(options, config) {
    if (typeof config === 'undefined') return;
    Object.assign(options, typeof config === 'function' ? config(options) : config);
  }

  import(`${cwd}/${file}`).then(settings => {
    extend(watchOptions, settings.watch);
    extend(buildOptions, settings.build);
    extend(serveOptions, settings.serve);
    main();
  });

} else { main(); }
