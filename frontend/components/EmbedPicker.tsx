'use client';

import { useId, useState } from 'react';

import { ResizingIframe } from '@/components/ResizingIframe';

/**
 * Interactive variant of the journalists-page embed example: a picker
 * (group, topic, ...) that swaps the previewed widget AND the copyable
 * iframe snippet in lockstep. Lets a newsroom find the exact embed they
 * want before copying the code, instead of hand-editing the slug.
 *
 * Props are all serializable (this is a client component rendered from a
 * server page): the src + snippet are built from ``srcPrefix`` + the
 * selected option value + ``srcSuffix`` rather than a passed-in builder.
 */
export interface EmbedPickerOption {
  value: string;
  label: string;
}

export function EmbedPicker({
  title,
  description,
  pickerLabel,
  options,
  defaultValue,
  srcPrefix,
  srcSuffix,
  height,
  iframeTitle,
  origin,
  snippetSummary,
}: {
  title: string;
  description: string;
  pickerLabel: string;
  options: EmbedPickerOption[];
  defaultValue: string;
  srcPrefix: string;
  srcSuffix: string;
  height: number;
  iframeTitle: string;
  origin: string;
  snippetSummary: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const selectId = useId();

  const src = `${srcPrefix}${value}${srcSuffix}`;
  const snippet = `<iframe\n  src="${origin}${srcPrefix}${value}${srcSuffix}"\n  width="100%" height="${height}" frameborder="0"\n  loading="lazy"\n  title="${iframeTitle}"\n></iframe>`;

  return (
    <div style={{ margin: '20px 0 30px' }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--ink)',
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-3)' }}>{description}</p>

      <label
        htmlFor={selectId}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
          fontSize: 13,
          color: 'var(--ink-2)',
        }}
      >
        <span style={{ fontWeight: 600 }}>{pickerLabel}</span>
        <select
          id={selectId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{
            fontSize: 13,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--rule-strong)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            fontWeight: 600,
            cursor: 'pointer',
            maxWidth: 320,
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <ResizingIframe src={src} title={iframeTitle} fallbackHeight={height} />

      <details style={{ marginTop: 12 }}>
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--ink-3)',
            padding: '4px 0',
          }}
        >
          {snippetSummary}
        </summary>
        <pre
          style={{
            background: 'var(--paper-3)',
            border: '1px solid var(--rule-strong)',
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontVariantLigatures: 'none',
            fontFeatureSettings: '"liga" 0, "calt" 0',
            overflowX: 'auto',
            whiteSpace: 'pre',
            margin: '8px 0 0',
            color: 'var(--ink-2)',
          }}
        >
          {snippet}
        </pre>
      </details>
    </div>
  );
}
