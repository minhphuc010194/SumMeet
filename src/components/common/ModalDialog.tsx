"use client";

import React, { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidthClass?: string;
  isDismissible?: boolean;
}

export function ModalDialog({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidthClass = "max-w-2xl",
  isDismissible = true,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "true");
      }
    } else if (!isOpen && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [isOpen]);

  // Fallback for Safari / Tauri WKWebView where HTMLDialogElement.prototype.closedBy is not yet supported
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose();
    };

    const handleCancel = (event: Event) => {
      if (!isDismissible) event.preventDefault();
    };

    const handleBackdropClick = (event: MouseEvent) => {
      if (!isDismissible) return;
      if (
        typeof HTMLDialogElement !== "undefined" &&
        "closedBy" in HTMLDialogElement.prototype
      ) {
        return;
      }
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;

      if (isDialogContent) return;
      dialog.close();
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [onClose, isDismissible]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      closedby={isDismissible ? "any" : "none"}
      aria-labelledby={titleId}
      className={`m-auto w-full ${maxWidthClass} rounded-2xl border border-slate-700/80 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-xs`}
    >
      <div className="flex items-start justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-slate-50">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
          )}
        </div>
        {isDismissible && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="max-h-[78vh] overflow-y-auto px-6 py-5">{children}</div>
    </dialog>
  );
}
