import { Icon, PulseAiIcon } from '../icons';
import { useSettings } from '../settings';

export function AppShell({ navItems, activeRoute, onNavigate, children }) {
  return (
    <div className="app-shell">
      <main className="app-shell__content">
        <div key={activeRoute} className="page-enter">
          {children}
        </div>
      </main>
      <BottomNav items={navItems} activeId={activeRoute} onNavigate={onNavigate} />
    </div>
  );
}

export function AppHeader({ statusText }) {
  const { strings, openSettings } = useSettings();

  return (
    <header className="app-header">
      <div>
        <h1 className="app-header__title">{strings.appName}</h1>
        {statusText && (
          <p className="app-header__status">
            <span className="status-dot app-header__dot" />
            {statusText}
          </p>
        )}
      </div>
      <button
        type="button"
        className="app-header__settings"
        aria-label={strings.displaySettings}
        onClick={openSettings}
      >
        <Icon name="sliders" size={20} />
      </button>
    </header>
  );
}

function BottomNav({ items, activeId, onNavigate }) {
  const { strings } = useSettings();

  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map((item) => {
        const isActive = item.id === activeId;

        let className = 'bottom-nav__item';
        if (item.featured) className += ' bottom-nav__item--featured';
        if (isActive) className += ' bottom-nav__item--active';

        return (
          <button
            key={item.id}
            type="button"
            className={className}
            aria-current={isActive ? 'page' : undefined}
            aria-disabled={item.ready ? undefined : true}
            onClick={() => item.ready && onNavigate(item.id)}
          >
            <span className="bottom-nav__icon">
              {item.featured ? <PulseAiIcon size={48} /> : <Icon name={item.icon} size={22} />}
            </span>
            <span className="bottom-nav__label">{strings.nav[item.id]}</span>
          </button>
        );
      })}
    </nav>
  );
}
