import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Tense } from '../../contracts';
import { TENSE_GUIDE } from '../../content/tense-guide';
import './written-tense.css';

export interface WrittenTenseResult { selected: Tense; correct: boolean }
export interface WrittenTenseProps {
  expected: Tense;
  onResultChange: (result: WrittenTenseResult) => void;
}
interface MenuPosition {
  left: number; top: number | undefined; bottom: number | undefined; width: number; maxHeight: number;
}
const presentCount = TENSE_GUIDE.filter(item => item.tense.startsWith('present-')).length;
const aspect = (label: string) => label.replace(/^(Present|Past) /u, '').replace(/^./u, letter => letter.toUpperCase());

/** Local recognition practice; no oral evidence or connection is required. */
export function WrittenTense({ expected, onResultChange }: WrittenTenseProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Tense | ''>('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition>({ left: 0, top: 0, bottom: undefined, width: 0, maxHeight: 0 });
  const search = useRef({ text: '', at: 0 });
  const correct = selected !== '' && selected === expected;
  const status = selected === '' ? 'empty' : correct ? 'correct' : 'incorrect';
  const selectedIndex = TENSE_GUIDE.findIndex(item => item.tense === selected);
  const menuId = `${id}-options`;

  function placeMenu() {
    const anchor = trigger.current?.getBoundingClientRect();
    if (!anchor) return false;
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
    const topEdge = (viewport?.offsetTop ?? 0) + 12;
    const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 12;
    const dock = document.querySelector('.ll-dock')?.getBoundingClientRect();
    const bottomEdge = dock && dock.top > topEdge && dock.top < viewportBottom && dock.bottom > topEdge
      ? dock.top - 8 : viewportBottom;
    const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
    if (anchor.bottom <= topEdge || anchor.top >= bottomEdge || anchor.right <= leftEdge || anchor.left >= leftEdge + viewportWidth - 24) {
      setOpen(false); return false;
    }
    const aboveEdge = Math.min(anchor.top - 8, bottomEdge);
    const above = Math.max(0, aboveEdge - topEdge);
    const below = Math.max(0, bottomEdge - anchor.bottom - 8);
    const desiredHeight = Math.min(menu.current?.scrollHeight || 248, 360);
    const flipped = below < desiredHeight && above > below;
    const width = Math.min(420, (viewport?.width ?? document.documentElement.clientWidth) - 24);
    setPosition({
      left: Math.max(leftEdge, Math.min(anchor.left, leftEdge + (viewport?.width ?? document.documentElement.clientWidth) - 24 - width)),
      top: flipped ? undefined : anchor.bottom + 8,
      bottom: flipped ? window.innerHeight - aboveEdge : undefined,
      width, maxHeight: Math.min(360, flipped ? above : below),
    });
    return true;
  }
  function show(index = selectedIndex < 0 ? 0 : selectedIndex) {
    setActiveIndex(index); search.current = { text: '', at: 0 };
    if (placeMenu()) { setOpen(true); trigger.current?.focus({ preventScroll: true }); }
  }
  function commit(index: number) {
    const choice = TENSE_GUIDE[index];
    if (!choice) return;
    setSelected(choice.tense); setOpen(false);
    onResultChange({ selected: choice.tense, correct: choice.tense === expected });
    trigger.current?.focus({ preventScroll: true });
  }
  function typeahead(letter: string) {
    const now = Date.now();
    const text = open && now - search.current.at < 700 ? search.current.text + letter.toLowerCase() : letter.toLowerCase();
    search.current = { text, at: now };
    const query = [...text].every(character => character === text[0]) ? text[0]! : text;
    const current = open ? activeIndex : selectedIndex;
    const start = query.length === 1 ? current + 1 : Math.max(0, current);
    for (let step = 0; step < TENSE_GUIDE.length; step++) {
      const index = (start + step) % TENSE_GUIDE.length;
      const item = TENSE_GUIDE[index]!;
      if (item.label.toLowerCase().startsWith(query) || aspect(item.label).toLowerCase().startsWith(query)) {
        setActiveIndex(index);
        if (!open && placeMenu()) setOpen(true);
        return;
      }
    }
  }

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    window.visualViewport?.addEventListener('resize', placeMenu);
    window.visualViewport?.addEventListener('scroll', placeMenu);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
      window.visualViewport?.removeEventListener('resize', placeMenu);
      window.visualViewport?.removeEventListener('scroll', placeMenu);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const option = menu.current.querySelector<HTMLElement>(`[data-tense-index="${activeIndex}"]`);
    if (!option) return;
    const bounds = menu.current.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    if (row.top < bounds.top + 6) menu.current.scrollTop -= bounds.top + 6 - row.top;
    else if (row.bottom > bounds.bottom - 6) menu.current.scrollTop += row.bottom - bounds.bottom + 6;
  }, [open, activeIndex, position.maxHeight, position.top, position.bottom]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return <div className="sentences-tense" data-status={status}>
    <button ref={trigger} type="button" className="sentences-tense-trigger" role="combobox" aria-label="Verb tense"
      aria-haspopup="listbox" aria-expanded={open} aria-controls={menuId}
      aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
      aria-invalid={status === 'incorrect' || undefined} aria-describedby={selected ? `${id}-status` : undefined}
      data-value={selected} onClick={() => open ? setOpen(false) : show()}
      onBlur={() => setOpen(false)}
      onKeyDown={event => {
        if (event.key === 'Tab') { setOpen(false); return; }
        if (event.key === 'Escape') {
          if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          return;
        }
        if (event.key === ' ' && open && search.current.text && Date.now() - search.current.at < 700) {
          event.preventDefault(); typeahead(' '); return;
        }
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          search.current = { text: '', at: 0 };
          if (event.key === 'Enter' || event.key === ' ') { if (open) commit(activeIndex); else show(); return; }
          if (event.key === 'Home') { if (open) setActiveIndex(0); else show(0); return; }
          if (event.key === 'End') { if (open) setActiveIndex(TENSE_GUIDE.length - 1); else show(TENSE_GUIDE.length - 1); return; }
          if (!open) { show(selectedIndex < 0 && event.key === 'ArrowUp' ? TENSE_GUIDE.length - 1 : selectedIndex < 0 ? 0 : selectedIndex); return; }
          setActiveIndex(index => event.key === 'ArrowDown' ? Math.min(TENSE_GUIDE.length - 1, index + 1)
            : event.key === 'ArrowUp' ? Math.max(0, index - 1)
              : event.key === 'ArrowRight' ? Math.min(TENSE_GUIDE.length - 1, index < presentCount ? index + presentCount : index)
                : index >= presentCount ? index - presentCount : index);
          return;
        }
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); typeahead(event.key); }
      }}>
      <span className="sentences-tense-value">{selectedIndex < 0 ? 'Choose tense' : TENSE_GUIDE[selectedIndex]!.label}</span>
      {selected && <svg className="sentences-tense-outcome" aria-hidden="true" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {correct ? <path d="m5 12 4 4L19 6" /> : <path d="m7 7 10 10M17 7 7 17" />}
      </svg>}
      <svg className="sentences-tense-chevron" aria-hidden="true" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </button>
    {open && createPortal(<div ref={menu} id={menuId} role="listbox" aria-label="Verb tense options"
      className="sentences-tense-menu" style={position}>
      {(['Present', 'Past'] as const).map(family => <div key={family} role="group" aria-labelledby={`${id}-${family}`} className="sentences-tense-group">
        <div id={`${id}-${family}`} className="sentences-tense-heading">{family}</div>
        {TENSE_GUIDE.map((item, index) => ({ ...item, index })).filter(item => item.tense.startsWith(family.toLowerCase() + '-')).map(item =>
          <button key={item.tense} id={`${id}-option-${item.index}`} type="button" role="option" tabIndex={-1}
            className="sentences-tense-option" aria-label={item.label} aria-selected={selected === item.tense}
            data-active={activeIndex === item.index || undefined} data-tense-index={item.index}
            onPointerDown={event => event.preventDefault()}
            onPointerEnter={event => { if (event.pointerType === 'mouse') setActiveIndex(item.index); }}
            onClick={() => commit(item.index)}>{aspect(item.label)}</button>)}
      </div>)}
    </div>, document.body)}
    <span id={`${id}-status`} className="sentences-tense-announcement" role="status">
      {selected ? correct ? 'Correct tense.' : 'Try another tense.' : ''}
    </span>
  </div>;
}
