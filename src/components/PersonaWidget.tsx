"use client";

import Script from "next/script";
import { useEffect } from "react";

type PersonaHandle = {
  open?: () => void;
  close?: () => void;
};

declare global {
  interface Window {
    cantoPersona?: PersonaHandle;
  }
}

const PERSONA_SCRIPT_SRC =
  "https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js";

export function PersonaWidget({ clientToken }: { clientToken: string }) {
  useEffect(() => {
    const onReady = (e: Event) => {
      const handle = (e as CustomEvent<PersonaHandle>).detail;
      window.cantoPersona = handle;
    };
    window.addEventListener("persona:ready", onReady);
    return () => window.removeEventListener("persona:ready", onReady);
  }, []);

  return (
    <Script
      id="persona-widget"
      src={PERSONA_SCRIPT_SRC}
      strategy="afterInteractive"
      data-runtype-token={clientToken}
      data-config={JSON.stringify({
        windowKey: "cantoPersona",
        apiUrl: "https://api.runtype.com",
        launcher: {
          enabled: true,
          title: "Canto AI",
          subtitle: "Ask about your DAM.",
          position: "bottom-right",
        },
      })}
    />
  );
}

export function openPersona() {
  if (typeof window === "undefined") return;
  const handle = window.cantoPersona;
  if (handle?.open) {
    handle.open();
  } else {
    window.addEventListener(
      "persona:ready",
      (e) => {
        const h = (e as CustomEvent<PersonaHandle>).detail;
        h?.open?.();
      },
      { once: true },
    );
  }
}
