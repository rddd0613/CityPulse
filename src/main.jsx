import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { AppShell } from './components/Layout';
import ComparePage from './pages/ComparePage';
import DataPage from './pages/DataPage';
import ExplorePage from './pages/ExplorePage';
import InsightsPage from './pages/InsightsPage';
import { SettingsProvider, SettingsSheet, useSettings } from './settings';
import {
  DEFAULT_AREA_ID,
  DEFAULT_BASELINE_YEAR,
  DEFAULT_ROUTE,
  DEFAULT_TARGET_YEAR,
  MAP_LAYERS,
  NAV_ITEMS,
  resolveTargetYear,
} from './data';

const PAGES = {
  explore: ExplorePage,
  compare: ComparePage,
  insights: InsightsPage,
  data: DataPage,
};

function readRoute() {
  const route = window.location.hash.replace('#/', '').replace('#', '');
  if (PAGES[route]) {
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
  const { isSheetOpen } = useSettings();

  const [pickedAreaId, setAreaId] = useState(null);
  const [layerId, setLayerId] = useState(MAP_LAYERS[0].id);
  const [baselineYear, setBaselineYearState] = useState(DEFAULT_BASELINE_YEAR);
  const [targetYear, setTargetYear] = useState(DEFAULT_TARGET_YEAR);

  const setBaselineYear = useCallback((year) => {
    setBaselineYearState(year);
    setTargetYear((current) => resolveTargetYear(year, current));
  }, []);

  const selection = {
    areaId: pickedAreaId ?? DEFAULT_AREA_ID,
    pickedAreaId,
    layerId,
    baselineYear,
    targetYear,
    setAreaId,
    setLayerId,
    setBaselineYear,
    setTargetYear,
  };

  const Page = PAGES[route];

  return (
    <AppShell navItems={NAV_ITEMS} activeRoute={route} onNavigate={navigate}>
      <Page selection={selection} onNavigate={navigate} />
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
