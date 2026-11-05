import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { AppShell, ChooseAreaFirst } from './components/Layout';
import ComparePage from './pages/ComparePage';
import DataPage from './pages/DataPage';
import ExplorePage from './pages/ExplorePage';
import InsightsPage from './pages/InsightsPage';
import PulseAiPage from './pages/PulseAiPage';
import { SettingsProvider, SettingsSheet, useSettings } from './settings';
import { stopSpeaking } from './pulse-ai/speech';
import {
  DEFAULT_BASELINE_YEAR,
  DEFAULT_ROUTE,
  DEFAULT_TARGET_YEAR,
  MAP_LAYERS,
  NAV_ITEMS,
  resolveTargetYear,
} from './data';

const NEEDS_AREA = ['compare', 'insights'];
const CHAT_ROUTE = 'pulse-ai';

const PAGES = {
  explore: ExplorePage,
  compare: ComparePage,
  insights: InsightsPage,
  data: DataPage,
};

function readRoute() {
  const route = window.location.hash.replace('#/', '').replace('#', '');
  if (PAGES[route] || route === CHAT_ROUTE) {
    return route;
  }
  return DEFAULT_ROUTE;
}

function useHashRoute() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    function onChange() {
      setRoute(readRoute());
    }
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next) => {
    window.location.hash = `/${next}`;
  }, []);

  return [route, navigate];
}

function App() {
  const [route, navigate] = useHashRoute();
  const { isSheetOpen, strings } = useSettings();

  const [areaId, setAreaId] = useState(null);
  const [layerId, setLayerId] = useState(MAP_LAYERS[0].id);
  const [baselineYear, setBaselineYearState] = useState(DEFAULT_BASELINE_YEAR);
  const [targetYear, setTargetYear] = useState(DEFAULT_TARGET_YEAR);

  const setBaselineYear = useCallback((year) => {
    setBaselineYearState(year);
    setTargetYear((current) => resolveTargetYear(year, current));
  }, []);

  const selection = {
    areaId,
    layerId,
    baselineYear,
    targetYear,
    setAreaId,
    setLayerId,
    setBaselineYear,
    setTargetYear,
  };

  const isChatOpen = route === CHAT_ROUTE;
  const [chatStarted, setChatStarted] = useState(isChatOpen);

  useEffect(() => {
    if (isChatOpen) {
      setChatStarted(true);
    } else {
      stopSpeaking();
    }
  }, [isChatOpen]);

  const Page = PAGES[route];
  const needsArea = NEEDS_AREA.includes(route) && !areaId;

  let page = <Page selection={selection} onNavigate={navigate} />;
  if (isChatOpen) {
    page = null;
  } else if (needsArea) {
    page = <ChooseAreaFirst title={strings.nav[route]} onNavigate={navigate} />;
  }

  let chat = null;
  if (chatStarted) {
    chat = <PulseAiPage selection={selection} hidden={!isChatOpen} />;
  }

  return (
    <AppShell navItems={NAV_ITEMS} activeRoute={route} onNavigate={navigate} kept={chat}>
      {page}
      {isSheetOpen && <SettingsSheet />}
    </AppShell>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
