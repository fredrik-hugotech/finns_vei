import { useRef } from 'react';

// Native-app feel: drag a bottom sheet down by its handle to dismiss it.
// A real drag (finger moved) won't also fire a click, so a tap on the handle
// still closes and a drag past the threshold closes — anything shorter snaps back.
export default function useSheetDrag(onClose, { threshold = 120 } = {}) {
  const sheetRef = useRef(null);
  const startY = useRef(null);
  const active = useRef(false);

  const translate = (px) => {
    const el = sheetRef.current;
    if (el) el.style.transform = px ? `translateY(${px}px)` : '';
  };

  const onTouchStart = (event) => {
    startY.current = event.touches[0].clientY;
    active.current = true;
    const el = sheetRef.current;
    if (el) el.style.transition = 'none';
  };

  const onTouchMove = (event) => {
    if (!active.current || startY.current == null) return;
    const dy = event.touches[0].clientY - startY.current;
    // Resist upward drags; follow downward ones 1:1.
    translate(dy > 0 ? dy : dy * 0.25);
  };

  const onTouchEnd = (event) => {
    if (!active.current) return;
    active.current = false;
    const dy = event.changedTouches[0].clientY - (startY.current || 0);
    startY.current = null;
    const el = sheetRef.current;
    if (el) el.style.transition = '';
    if (dy > threshold) { onClose?.(); return; }
    translate(0);
  };

  const onTouchCancel = () => {
    if (!active.current) return;
    active.current = false;
    startY.current = null;
    const el = sheetRef.current;
    if (el) el.style.transition = '';
    translate(0);
  };

  return { sheetRef, dragHandlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } };
}
