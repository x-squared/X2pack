type Props = {
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

export default function ConfirmDialog({
  message,
  detail,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: Props): React.ReactElement {
  function handleOverlayClick(e: React.MouseEvent): void {
    if (e.target === e.currentTarget) onCancel?.();
  }

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className="dialog" role="dialog" aria-modal="true">
        <p className="dialog__message">{message}</p>
        {detail && <p className="dialog__detail">{detail}</p>}
        <div className="dialog__actions">
          {cancelLabel != null && onCancel && (
            <button className="btn btn--ghost dialog__btn" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'} dialog__btn`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
