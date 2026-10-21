"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { STATUS_LABELS, STATUS_ORDER } from "@/lib/status";

import { RatingAnswers } from "./finish-prompt";
import type { ShelfCard } from "./shelf-tile";
import { markDone, setStatus } from "./version/[id]/actions";

/**
 * A cover on the main page opens this rather than the game (Jay, 2026-10-21):
 * moving wishlist to playing, or playing to dropped, was a trip to the
 * version page and back. The game's page is one press further, under Open.
 * Played goes by way of the rating, as Finished it does in the band.
 */
export function QuickShelf({
  card,
  title,
  subtitle,
  className,
  children,
}: {
  card: ShelfCard;
  title: string;
  subtitle: string;
  className: string;
  /** What the opener shows: nothing but a name on a tile, the cover in the band. */
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [finishing, setFinishing] = useState(false);

  const open = () => {
    setFinishing(false);
    dialog.current?.showModal();
    dialog.current?.focus();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={open} className={className}>
        {children}
      </button>
      {/* A sibling of the opener, not inside it, so a press in the panel does
          not bubble back up and open it again. */}
      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        tabIndex={-1}
        // The panel has no padding of its own, so only a press on the dim
        // room around it lands on the dialog itself.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(100%-2rem,30rem)] border border-line bg-band p-0 text-ink outline-none backdrop:bg-plank-shadow/80"
      >
        <div className="p-5 sm:p-6">
          <div className="flex gap-4">
            {/* No art, no box: the title beside it already says what a
                placeholder would. */}
            {card.coverUrl ? (
              <div className="relative aspect-[3/4] w-16 shrink-0 bg-panel">
                <Image src={card.coverUrl} alt="" fill sizes="64px" className="object-cover" unoptimized />
              </div>
            ) : null}
            <div className="min-w-0">
              <h2 id={headingId} className="font-display text-2xl leading-tight break-words">
                {finishing ? `Finished ${title}` : title}
              </h2>
              <p className="mt-1 font-narrow text-ink-dim">{finishing ? "How was it, out of ten?" : subtitle}</p>
            </div>
          </div>

          {finishing ? (
            <form
              className="mt-5"
              action={async (formData) => {
                await markDone(formData);
                close();
              }}
            >
              <input type="hidden" name="versionId" value={card.versionId} />
              <input type="hidden" name="completion" value="credits" />
              <RatingAnswers rating={card.rating} onCancel={() => setFinishing(false)} />
            </form>
          ) : (
            <>
              <form
                aria-label="Shelf"
                className="-mx-5 mt-5 overflow-x-auto px-5 text-[13px] sm:mx-0 sm:px-0 sm:text-[14px]"
                action={async (formData) => {
                  await setStatus(formData);
                  close();
                }}
              >
                <input type="hidden" name="versionId" value={card.versionId} />
                <ShelfButtons current={card.status} onCurrent={close} onFinish={() => setFinishing(true)} />
              </form>

              <div className="mt-5 flex gap-2">
                <Link href={`/version/${card.versionId}`} className="btn btn-sm">
                  Open the game
                </Link>
                <div className="flex-1" />
                <button type="button" onClick={close} className="btn btn-sm">
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

function ShelfButtons({
  current,
  onCurrent,
  onFinish,
}: {
  current: string;
  onCurrent: () => void;
  onFinish: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="segmented">
      {STATUS_ORDER.map((value) =>
        value === current ? (
          <button key={value} type="button" aria-pressed="true" onClick={onCurrent}>
            {STATUS_LABELS[value]}
          </button>
        ) : value === "played" ? (
          <button key={value} type="button" disabled={pending} onClick={onFinish}>
            {STATUS_LABELS[value]}
          </button>
        ) : (
          <button key={value} type="submit" name="status" value={value} disabled={pending}>
            {STATUS_LABELS[value]}
          </button>
        ),
      )}
    </div>
  );
}
