import type { LearningLanguage } from '../../contracts';
import { InfoTooltip } from '../../ui/mobile/InfoTooltip';

/** A hover/focus tooltip with tap support; reading it holds the current exercise. */
export function PictureInfo({ text, holdId, onHoldChange, label = 'Picture information', language = 'en' }: {
  text: string; holdId: string; onHoldChange: (id: string, held: boolean) => void; label?: string; language?: LearningLanguage;
}) {
  return <InfoTooltip text={text} label={label} language={language === 'fr' ? 'es' : 'en'}
    holdId={holdId} onHoldChange={onHoldChange} className="verbs-picture-info"
    buttonClassName="verbs-info-button" tooltipClassName="verbs-info-tooltip" />;
}
