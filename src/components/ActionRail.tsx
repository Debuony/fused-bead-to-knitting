import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Big ✨ button for the lazy path. */
  autoLabel: string;
  autoHint?: string;
  onAuto: () => void;
  autoBusy?: boolean;
  autoDisabled?: boolean;
  back?: () => void;
  next?: { label: string; onClick: () => void; disabled?: boolean };
  /** Extra content (stats, warnings, secondary auto actions). */
  children?: ReactNode;
}

/** Right-hand column on every step: the automatic option and navigation. */
export function ActionRail({ autoLabel, autoHint, onAuto, autoBusy, autoDisabled, back, next, children }: Props) {
  const { t } = useTranslation();
  return (
    <aside className="panel rail">
      <button className="btn primary big" onClick={onAuto} disabled={autoBusy || autoDisabled}>
        {autoBusy ? `⏳ ${t('upload.working')}` : `✨ ${autoLabel}`}
      </button>
      {autoHint && <p className="hint">{autoHint}</p>}
      {children}
      <div className="rail-nav">
        {next && (
          <button className="btn primary" onClick={next.onClick} disabled={next.disabled}>{next.label} →</button>
        )}
        {back && <button className="btn" onClick={back}>← {t('common.back')}</button>}
      </div>
    </aside>
  );
}

/** Collapsible group for settings most people never need. */
export function More({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="more" open={open}>
      <summary>{title}</summary>
      <div className="more-body">{children}</div>
    </details>
  );
}
