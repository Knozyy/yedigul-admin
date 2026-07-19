import { useEffect } from 'react';

export default function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div>
            <span className="eyebrow">YEDİGÜL</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Kapat">×</button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

