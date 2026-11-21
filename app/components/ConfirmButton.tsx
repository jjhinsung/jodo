"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className: string;
  armedClassName: string;
  ariaLabel?: string;
};

/** Destructive button that needs a second tap within 3 seconds. */
export default function ConfirmButton({ label, confirmLabel, onConfirm, className, armedClassName, ariaLabel }: Props) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        if (timer.current) clearTimeout(timer.current);
        if (armed) {
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 3000);
      }}
      aria-label={armed ? `${confirmLabel} Tap again to confirm` : ariaLabel}
      className={`${className} ${armed ? armedClassName : ""}`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
