"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useJodoTransition, type TransitionKind } from "./TransitionProvider";

type Props = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  kind: TransitionKind;
};

/** A normal link that plays a page transition first (new-tab / modified clicks behave as usual). */
export default function TransitionLink({ href, kind, onClick, ...rest }: Props) {
  const { go } = useJodoTransition();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(href, kind);
      }}
    />
  );
}
