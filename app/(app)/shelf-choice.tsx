"use client";

import { useState } from "react";

import { STATUS_LABELS, STATUS_ORDER, type Status } from "@/lib/status";

/**
 * Which shelf something goes on as it is added: the version page's segmented
 * control, choosing rather than saving. Submitted as `status`.
 */
export function ShelfChoice({ defaultValue = "backlog" }: { defaultValue?: Status }) {
  const [status, setStatus] = useState<Status>(defaultValue);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-narrow text-ink-dim">Shelf</span>
      <input type="hidden" name="status" value={status} />
      <div role="group" aria-label="Shelf" className="-mx-4 overflow-x-auto px-4 text-[14px] sm:mx-0 sm:px-0 sm:text-base">
        <div className="segmented sm:max-w-xl">
          {STATUS_ORDER.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {STATUS_LABELS[value]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
