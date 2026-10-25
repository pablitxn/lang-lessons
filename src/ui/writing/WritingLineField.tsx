import { useImperativeHandle, useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from 'react';
import './writing-line-field.css';

export type WritingLineFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & { textareaRef?: Ref<HTMLTextAreaElement> };

/** A single writing line that expands with its content without changing keyboard semantics. */
export function WritingLineField({ textareaRef, className, ...props }: WritingLineFieldProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(textareaRef, () => field.current!, []);
  useLayoutEffect(() => {
    if (CSS.supports('field-sizing', 'content')) return;
    const element = field.current;
    if (!element) return;
    const resize = () => { element.style.height = '0px'; element.style.height = `${element.scrollHeight}px`; };
    resize();
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; resize(); }
    });
    observer.observe(element);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [props.value]);
  return <div className="writing-line-field">
    <textarea {...props} ref={field} rows={1} className={`writing-line-input${className ? ` ${className}` : ''}`} />
  </div>;
}
