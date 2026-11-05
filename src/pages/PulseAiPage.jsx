import PulseAI from '../pulse-ai/PulseAI';
import { AppHeader } from '../components/Layout';
import { getArea, getCity } from '../data';
import { useSettings } from '../settings';

function getChatArea(areaId) {
  if (!areaId) {
    return undefined;
  }

  const area = getArea(areaId);
  if (area.kind === 'city') {
    return area.names.en;
  }
  return `${area.names.en}, ${getCity(area).names.en}`;
}

export default function PulseAiPage({ selection }) {
  const { settings, strings } = useSettings();

  return (
    <div className="pulse-ai-page">
      <AppHeader />
      <div className="pulse-ai-page__screen">
        <PulseAI
          showHeader={false}
          settings={{ unit: settings.temperatureUnit, lang: settings.language }}
          area={getChatArea(selection.areaId)}
          labels={strings.pulseAi}
        />
      </div>
    </div>
  );
}
