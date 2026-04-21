"use client";

import { useState } from "react";
import { openPersona } from "./PersonaWidget";

export function LaunchChatButton() {
  const [opened, setOpened] = useState(false);

  const handleClick = () => {
    openPersona();
    setOpened(true);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center justify-center rounded-full bg-[#FF6A2A] px-8 py-3.5 text-base font-medium text-white transition-colors hover:bg-[#ea5a1f] focus:outline-none focus:ring-2 focus:ring-[#FF6A2A] focus:ring-offset-2"
      >
        Launch Chat
      </button>
      {opened ? (
        <p className="text-sm text-[#6B6B6B]">
          Chat opened in the bottom-right corner.
        </p>
      ) : null}
    </div>
  );
}
