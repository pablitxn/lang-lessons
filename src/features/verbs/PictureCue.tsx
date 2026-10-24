import type { LearningLanguage } from '../../contracts';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { PictureInfo } from './PictureInfo';

/** Keeps the complete photograph visible at its natural aspect ratio. */
export function PictureCue({ image, information, navigation, onHoldChange, language = 'en' }: {
  language?: LearningLanguage;
  image: { src: string; alt: string };
  information: string;
  navigation: ReactNode;
  onHoldChange: (id: string, held: boolean) => void;
}) {
  const text = (en: string, es: string) => language === 'fr' ? es : en;
  const id = useId();
  const frame = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const latestHold = useRef(onHoldChange);
  latestHold.current = onHoldChange;
  const [failed, setFailed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), 4500);
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !frame.current?.contains(event.target)) setRevealed(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => { clearTimeout(timer); document.removeEventListener('pointerdown', dismiss); };
  }, [revealed]);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.current?.close();
      document.body.style.overflow = previousOverflow;
      latestHold.current(id, false);
    };
  }, [open, id]);
  useEffect(() => () => latestHold.current(id, false), [id]);

  function expand() {
    // Hold synchronously so a ready advancement timer cannot replace this photo.
    latestHold.current(id, true);
    setOpen(true);
    setRevealed(false);
  }
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return <>
    <div className="ll-cue verbs-picture-cue">
      <figure ref={frame} className="verbs-picture-frame" data-revealed={revealed || undefined}>
        {failed ? <p role="status" className="verbs-picture-unavailable">{text('The picture is unavailable. Your progress is safe.', 'La imagen no está disponible. Tu progreso está guardado.')}<br /><span lang="es">{image.alt}</span></p>
          : <img className="verbs-picture" src={image.src} alt={image.alt} onError={() => setFailed(true)}
            onPointerDown={event => { if (event.pointerType === 'touch') setRevealed(value => !value); }} />}
        {!failed && <button type="button" ref={trigger} className="verbs-photo-button verbs-expand"
          aria-label={text('Expand picture', 'Ampliar imagen')} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={expand}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
          </svg>
        </button>}
        <figcaption><PictureInfo language={language} label={text('Picture information', 'Información de la imagen')} text={information} holdId={`${id}-info`} onHoldChange={onHoldChange} /></figcaption>
        {navigation}
      </figure>
    </div>
    <dialog ref={dialog} id={id} className="verbs-picture-dialog" aria-label={text('Expanded picture', 'Imagen ampliada')}
      onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => {
        if (event.key === 'Tab') {
          // The viewer has one interactive control; keep its keyboard cycle local.
          event.preventDefault();
          event.currentTarget.querySelector('button')?.focus();
        }
      }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {open && <>
        <button type="button" className="verbs-photo-button verbs-picture-close" aria-label={text('Close expanded picture', 'Cerrar imagen ampliada')} onClick={close} autoFocus>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <img src={image.src} alt={image.alt} />
      </>}
    </dialog>
  </>;
}
