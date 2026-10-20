import { useCallback, useRef, useState } from 'react';

export function useDraftHistory<T>() {
  const [history, setHistory] = useState<{ past: (T | null)[]; present: T | null; future: (T | null)[] }>({ past: [], present: null, future: [] });
  const group = useRef({ key: '', at: 0 });
  const reset = useCallback(() => { group.current = { key: '', at: 0 }; setHistory({ past: [], present: null, future: [] }); }, []);
  const update = useCallback((next: T, key: string) => {
    const now = Date.now(), merge = group.current.key === key && now - group.current.at < 500;
    group.current = { key, at: now };
    setHistory(previous => JSON.stringify(previous.present) === JSON.stringify(next) ? previous : { past: merge ? previous.past : [...previous.past, previous.present].slice(-100), present: next, future: [] });
  }, []);
  const undo = useCallback(() => { group.current.key = ''; setHistory(previous => !previous.past.length ? previous : { past: previous.past.slice(0, -1), present: previous.past[previous.past.length - 1], future: [previous.present, ...previous.future] }); }, []);
  const redo = useCallback(() => { group.current.key = ''; setHistory(previous => !previous.future.length ? previous : { past: [...previous.past, previous.present], present: previous.future[0], future: previous.future.slice(1) }); }, []);
  return { value: history.present, update, reset, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
