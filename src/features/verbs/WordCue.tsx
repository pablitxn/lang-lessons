import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { PictureInfo } from './PictureInfo';

/** Reveals navigation on interaction while keeping the supplied word in view. */
export function WordCue({ base, information, navigation, onHoldChange }: {
  base: string;
  information: string;
  navigation: ReactNode;
  onHoldChange: (id: string, held: boolean) => void;
}) {
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  const revealGesture = useRef(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), 4500);
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !frame.current?.contains(event.target)) setRevealed(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => { clearTimeout(timer); document.removeEventListener('pointerdown', dismiss); };
  }, [revealed]);

  return <div ref={frame} className="ll-cue verbs-word-cue" data-revealed={revealed || undefined}
    onPointerDown={event => {
      revealGesture.current = false;
      if (event.pointerType === 'touch' && event.target instanceof Element && !event.target.closest('button')) {
        revealGesture.current = true;
        setRevealed(value => !value);
      }
    }}
    onPointerCancel={() => { revealGesture.current = false; }}
    onClickCapture={event => {
      const revealedByThisGesture = revealGesture.current;
      revealGesture.current = false;
      // A touch can retarget its click to the arrow that it just revealed.
      if (revealedByThisGesture && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    }}>
    <p className="ll-kicker">Supplied base form</p>
    <p className="ll-base">{base}</p>
    {navigation}
    <div className="verbs-word-information">
      <PictureInfo label="Verb information" text={information} holdId={`${id}-info`} onHoldChange={onHoldChange} />
    </div>
  </div>;
}
