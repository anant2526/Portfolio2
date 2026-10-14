"use client";

import type { ReactNode } from "react";
import { TwinProvider } from "@/components/twin/TwinProvider";
import TwinLauncher from "@/components/twin/TwinLauncher";
import TwinRoom from "@/components/twin/TwinRoom";
import BootLoader from "@/components/ui/BootLoader";
import Cursor from "@/components/ui/Cursor";
import Nav from "@/components/ui/Nav";
import { SmoothScroll } from "@/components/ui/SmoothScroll";

/** Client-side shell: twin state, smooth scrolling, cursor, nav and overlays. */
export default function Experience({ children }: { children: ReactNode }) {
  return (
    <TwinProvider>
      <SmoothScroll>
        <BootLoader />
        <Nav />
        <main>{children}</main>
        <TwinLauncher />
        <TwinRoom />
        <Cursor />
        <div className="grain" aria-hidden />
      </SmoothScroll>
    </TwinProvider>
  );
}
