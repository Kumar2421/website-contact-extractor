"use client";

import { useEffect } from "react";
import { useApi } from "./api";
import { CREDITS_EVENT, type Profile } from "./types";

export function CreditsBadge() {
  const { data, reload } = useApi<{ profile: Profile }>("/api/usage");
  useEffect(() => {
    const on = () => void reload();
    window.addEventListener(CREDITS_EVENT, on);
    window.addEventListener("hashchange", on);
    return () => {
      window.removeEventListener(CREDITS_EVENT, on);
      window.removeEventListener("hashchange", on);
    };
  }, [reload]);
  const p = data?.profile;
  return (
    <>
      <span>CREDITS {p ? p.credits.toLocaleString() : "…"}</span>
      <span className="muted">{p ? `${p.plan.toUpperCase()} PLAN` : ""}</span>
    </>
  );
}
