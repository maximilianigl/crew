/**
 * Platform-specific autoupdate backend selection (§10.2).
 *
 * macOS uses launchd; Linux uses a systemd user timer. The command layer
 * calls this file so platform branching stays out of command rendering.
 */

import { CrewError } from "../core/errors.ts";
import { type HostPlatform, hostPlatform } from "../core/platform.ts";
import {
  disableAutoupdate as disableLaunchdAutoupdate,
  type EnableInput,
  enableAutoupdate as enableLaunchdAutoupdate,
  isAutoupdateLoaded as isLaunchdAutoupdateLoaded,
} from "./launchd.ts";
import {
  disableSystemdAutoupdate,
  enableSystemdAutoupdate,
  isSystemdAutoupdateLoaded,
} from "./systemd.ts";

export function enableAutoupdate(input: EnableInput): void {
  const platform = hostPlatform();
  if (platform === "linux") {
    enableSystemdAutoupdate(input);
    return;
  }
  if (platform === "darwin") {
    enableLaunchdAutoupdate(input);
    return;
  }
  throw unsupportedAutoupdate();
}

export function disableAutoupdate(home: string): void {
  const platform = hostPlatform();
  if (platform === "linux") {
    disableSystemdAutoupdate(home);
    return;
  }
  if (platform === "darwin") {
    disableLaunchdAutoupdate(home);
    return;
  }
  throw unsupportedAutoupdate();
}

export function isAutoupdateLoaded(): boolean {
  if (hostPlatform() === "linux") return isSystemdAutoupdateLoaded();
  if (hostPlatform() === "darwin") return isLaunchdAutoupdateLoaded();
  return false;
}

export function autoupdateSchedulerName(platform: HostPlatform = hostPlatform()): string {
  if (platform === "linux") return "systemd timer";
  if (platform === "darwin") return "launchd agent";
  return "background updater";
}

function unsupportedAutoupdate(): CrewError {
  return new CrewError("usage_error", "crew autoupdate is supported on macOS and Linux only.", {
    platform: hostPlatform(),
  });
}
