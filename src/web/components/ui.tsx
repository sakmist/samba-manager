import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/* ------------------------------------------------------------------ toasts */

type ToastKind = 'ok' | 'error';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, kind === 'error' ? 7000 : 3500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('ok', message),
      error: (message) => push('error', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------- modal */

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">{title}</div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/** Comma/space separated list editor rendered as removable chips. */
export function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const additions = draft
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!additions.length) return;
    onChange([...new Set([...values, ...additions])]);
    setDraft('');
  };

  return (
    <div>
      <div className="tag-input">
        {values.map((value) => (
          <span className="tag" key={value}>
            {value}
            <button
              type="button"
              aria-label={`移除 ${value}`}
              onClick={() => onChange(values.filter((entry) => entry !== value))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        style={{ marginTop: values.length ? 8 : 0 }}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Backspace' && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
      />
    </div>
  );
}

export function Banner({ kind, children }: { kind: 'ok' | 'warn' | 'error'; children: ReactNode }) {
  return <div className={`banner banner--${kind}`}>{children}</div>;
}
