import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Mirall design tokens — surfaced as CSS-var-backed Tailwind colors
        // so utilities like `bg-paper`, `text-ink`, `border-rule` work.
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        'paper-3': 'var(--paper-3)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        rule: 'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        'accent-soft': 'var(--accent-soft)',
        aye: 'var(--aye)',
        'aye-soft': 'var(--aye-soft)',
        no: 'var(--no)',
        'no-soft': 'var(--no-soft)',
        abst: 'var(--abst)',
        'abst-soft': 'var(--abst-soft)',
        nv: 'var(--nv)',
        'nv-soft': 'var(--nv-soft)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
