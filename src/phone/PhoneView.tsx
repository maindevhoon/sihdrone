import { lazy, Suspense } from "react";
import PhoneController from "./PhoneController";
const HandheldView = lazy(() => import("./HandheldView"));
/** QR invitations open a light controller; the original district viewer stays opt-in. */
export default function PhoneView() {
  return new URLSearchParams(location.search).get("view") === "handheld" ? (
    <Suspense fallback={<p>Preparing handheld preview…</p>}>
      <HandheldView />
    </Suspense>
  ) : (
    <PhoneController />
  );
}
