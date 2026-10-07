import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageToggle, SettingsDrawer, useApplyTheme } from './components/SettingsDrawer';
import { Stepper } from './components/Stepper';
import { ChartStep } from './steps/ChartStep';
import { EditStep } from './steps/EditStep';
import { PixelizeStep } from './steps/PixelizeStep';
import { ScarfStep } from './steps/ScarfStep';
import { UploadStep } from './steps/UploadStep';
import { useProject } from './store/projectStore';
import logo from './assets/logo.svg';

const STEP_COMPONENTS = [UploadStep, PixelizeStep, EditStep, ChartStep, ScarfStep];

export default function App() {
  useApplyTheme();
  const { t } = useTranslation();
  const step = useProject((s) => s.step);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const Current = STEP_COMPONENTS[step];

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <img src={logo} width={34} height={34} alt="" />
          <div>
            {t('app.title')}
            <small>{t('app.subtitle')}</small>
          </div>
        </div>
        <Stepper />
        <div className="spacer" />
        <LanguageToggle />
        <button className="btn small" onClick={() => setSettingsOpen(true)}>⚙️ {t('settings.title')}</button>
      </header>
      <main>
        <Current />
      </main>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
