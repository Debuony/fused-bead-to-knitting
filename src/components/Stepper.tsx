import { useTranslation } from 'react-i18next';
import { useProject, type Step } from '../store/projectStore';

const STEPS = ['upload', 'pixelize', 'edit', 'chart', 'scarf'] as const;

export function Stepper() {
  const { t } = useTranslation();
  const { step, maxStep, goTo } = useProject();
  return (
    <nav className="stepper">
      {STEPS.map((key, i) => (
        <button
          key={key}
          className={`${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
          disabled={i > maxStep}
          onClick={() => goTo(i as Step)}
        >
          <span className="num">{i < step ? '✓' : i + 1}</span>
          {t(`steps.${key}`)}
        </button>
      ))}
    </nav>
  );
}
