/**
 * Jedyny CSS wstrzykiwany do strony: ukrywa zawartość posta poza naszym paskiem.
 * Nic nie jest usuwane z DOM (LinkedIn to React + wirtualizowana lista).
 */
const PAGE_CSS = `
[data-ailiss-state="collapsed"] > :not(.ailiss-host):not(.ailiss-flag-host) { display: none !important; }
[data-ailiss-state="collapsed"] { min-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; }
[data-ailiss-state="dimmed"] > :not(.ailiss-host):not(.ailiss-flag-host) { opacity: 0.35; transition: opacity 0.15s ease; }
[data-ailiss-state="dimmed"]:hover > :not(.ailiss-host):not(.ailiss-flag-host) { opacity: 1; }
[data-ailiss-flag] { position: relative; }
.ailiss-host { display: block; }
.ailiss-flag-host { position: absolute; top: 10px; right: 96px; z-index: 3; opacity: 0; transition: opacity 0.15s ease; }
[data-ailiss-flag]:hover > .ailiss-flag-host, .ailiss-flag-host:focus-within { opacity: 0.7; }
.ailiss-flag-host[data-open] { opacity: 1 !important; }
[data-ailiss-state="collapsed"] .ailiss-flag-host { display: none; }
`;

export function injectPageStyle(): void {
  if (document.getElementById('ailiss-page-style')) return;
  const style = document.createElement('style');
  style.id = 'ailiss-page-style';
  style.textContent = PAGE_CSS;
  (document.head ?? document.documentElement).append(style);
}
