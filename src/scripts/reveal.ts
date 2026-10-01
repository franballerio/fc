/**
 * Scroll-reveal observer for `.reveal` sections.
 *
 * `.reveal` content is legible by default; hidden state only exists under
 * `html.js`, so this observer is what flips `.is-visible` once a section
 * reaches the viewport. Each target is unobserved after revealing, so the page
 * never re-hides content and the registry keeps a hot reload from stacking
 * observers.
 */

interface RevealHandle {
  destroy: () => void;
}

interface RevealWindow extends Window {
  __revealHandle?: RevealHandle;
}

export function initReveal(): void {
  const host = window as RevealWindow;
  host.__revealHandle?.destroy();
  host.__revealHandle = undefined;

  const targets = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
  if (targets.length === 0) {
    return;
  }

  // No observer means no way to know when a section arrives: reveal now.
  if (typeof IntersectionObserver === 'undefined') {
    targets.forEach((target) => {
      target.classList.add('is-visible');
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -10% 0px' },
  );

  targets.forEach((target) => {
    observer.observe(target);
  });

  host.__revealHandle = {
    destroy: () => {
      observer.disconnect();
    },
  };
}
