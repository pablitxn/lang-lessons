import './writing-line-field.css';

/** Keep routine writing quiet and expose the limit only as the draft approaches it. */
export function CharacterCount({ count, maxLength }: { count: number; maxLength: number }) {
  if (count < maxLength * .8) return null;
  const level = count >= maxLength * .95 ? 'danger' : count >= maxLength * .9 ? 'warning' : 'normal';
  return <span className="writing-character-count" data-level={level} role="status" aria-label={`${count} de ${maxLength} caracteres`}>
    {count}/{maxLength}
  </span>;
}
