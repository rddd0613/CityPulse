import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Icon } from './icons';
import { LANGUAGES, STRINGS } from './i18n';

const STORAGE_KEY = 'city-pulse:settings';

const DEFAULT_SETTINGS = {
  showOverlayLabels: true,
  heatMapOpacity: 50,
  temperatureUnit: 'C',
  language: 'en',
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    console.warn('Settings could not be saved in this browser.');
  }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const language = LANGUAGES.find((item) => item.id === settings.language) ?? LANGUAGES[0];

  useEffect(() => {
    document.documentElement.lang = language.id;
    document.documentElement.dir = language.dir;
  }, [language]);

  const applySettings = useCallback((next) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      applySettings,
      strings: STRINGS[language.id],
      direction: language.dir,
      isSheetOpen,
      openSettings: () => setSheetOpen(true),
      closeSettings: () => setSheetOpen(false),
    }),
    [settings, applySettings, language, isSheetOpen],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}

const TEMPERATURE_OPTIONS = [
  { value: 'C', label: '°C', dir: 'ltr' },
  { value: 'F', label: '°F', dir: 'ltr' },
];

const LANGUAGE_OPTIONS = LANGUAGES.map((language) => ({
  value: language.id,
  label: language.label,
  lang: language.id,
}));

function SettingRow({ icon, iconTone = 'accent', title, hint, control, children }) {
  return (
    <section className="setting-row">
      <div className="setting-row__main">
        <span className={`setting-row__icon setting-row__icon--${iconTone}`}>
          <Icon name={icon} size={18} />
        </span>
        <span className="setting-row__text">
          <span className="setting-row__title">{title}</span>
          <span className="setting-row__hint">{hint}</span>
        </span>
        {control}
      </div>
      {children}
    </section>
  );
}

function ToggleSwitch({ checked, onChange, label }) {
  const className = checked ? 'toggle-switch toggle-switch--on' : 'toggle-switch';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={className}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-switch__thumb" />
    </button>
  );
}

function SegmentedControl({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const isActive = option.value === value;
        const className = isActive ? 'segmented__option segmented__option--active' : 'segmented__option';

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            lang={option.lang}
            dir={option.dir}
            className={className}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PercentSlider({ value, onChange, label }) {
  return (

    <div className="percent-slider" dir="ltr">
      <span>0%</span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={value}
        aria-label={label}
        style={{ '--fill': `${value}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="percent-slider__max">100%</span>
    </div>
  );
}

export function SettingsSheet() {
  const { settings, applySettings, strings, closeSettings } = useSettings();
  const [draft, setDraft] = useState(settings);
  const text = strings.settings;

  function update(key) {
    return (value) => setDraft((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        closeSettings();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeSettings]);

  function apply() {
    applySettings(draft);
    closeSettings();
  }

  return (
    <>
      <div className="settings-sheet__backdrop" onClick={closeSettings} />
      <section
        className="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <span className="settings-sheet__grabber" />

        <header className="settings-sheet__header">
          <span className="settings-sheet__badge">
            <Icon name="sliders" size={20} />
          </span>
          <span className="settings-sheet__heading">
            <h2 id="settings-title" className="settings-sheet__title">
              {text.title}
            </h2>
            <span className="settings-sheet__subtitle">{text.subtitle}</span>
          </span>
          <button
            type="button"
            className="settings-sheet__close"
            aria-label={text.close}
            onClick={closeSettings}
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="settings-sheet__rows">
          <SettingRow
            icon="layers"
            title={text.overlayLabels}
            hint={text.overlayLabelsHint}
            control={
              <ToggleSwitch
                checked={draft.showOverlayLabels}
                onChange={update('showOverlayLabels')}
                label={text.overlayLabels}
              />
            }
          />

          <SettingRow
            icon="opacity"
            title={text.heatOpacity}
            hint={text.heatOpacityHint}
            control={<span className="setting-row__value">{draft.heatMapOpacity}%</span>}
          >
            <PercentSlider
              value={draft.heatMapOpacity}
              onChange={update('heatMapOpacity')}
              label={text.heatOpacity}
            />
          </SettingRow>

          <SettingRow
            icon="thermometer"
            iconTone="positive"
            title={text.temperatureUnit}
            hint={text.temperatureUnitHint}
            control={
              <SegmentedControl
                options={TEMPERATURE_OPTIONS}
                value={draft.temperatureUnit}
                onChange={update('temperatureUnit')}
                label={text.temperatureUnit}
              />
            }
          />

          <SettingRow
            icon="language"
            iconTone="muted"
            title={text.language}
            hint={text.languageHint}
            control={
              <SegmentedControl
                options={LANGUAGE_OPTIONS}
                value={draft.language}
                onChange={update('language')}
                label={text.language}
              />
            }
          />
        </div>

        <footer className="settings-sheet__footer">
          <button type="button" className="settings-sheet__apply" onClick={apply}>
            <Icon name="check" size={20} />
            {text.apply}
          </button>
        </footer>
      </section>
    </>
  );
}
