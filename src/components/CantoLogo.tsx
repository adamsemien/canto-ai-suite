"use client";

import { useState } from "react";

const LOGO_SRC = "https://s3-us-west-2.amazonaws.com/static.dmc/canto-logo.png";

export function CantoLogo() {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <span className="text-lg font-semibold tracking-tight text-[#1A1A1A]">
        Canto
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt="Canto"
      className="h-7 w-auto"
      onError={() => setErrored(true)}
    />
  );
}
