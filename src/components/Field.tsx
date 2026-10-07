import type { ReactNode } from 'react';

interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: SliderProps) {
  return (
    <label className="field">
      {label}
      <div className="row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="value">{format ? format(value) : value}</span>
      </div>
    </label>
  );
}

interface NumberProps {
  label: ReactNode;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  suffix?: ReactNode;
}

export function NumberField({ label, value, min, max, onChange, suffix }: NumberProps) {
  return (
    <label className="field">
      {label}
      <div className="row">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isNaN(v)) return;
            onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v)));
          }}
        />
        {suffix && <span className="hint">{suffix}</span>}
      </div>
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

interface SegProps<T extends string> {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}

export function Seg<T extends string>({ value, options, onChange }: SegProps<T>) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}
