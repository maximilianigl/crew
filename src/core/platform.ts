/**
 * Host platform helpers for platform-specific behavior.
 *
 * Implements the platform selection parts of §10.2 and §10.3. Tests can
 * override `process.platform` / `process.arch` directly, so this file keeps
 * the production reads centralized without adding mutable global state.
 */

export type HostPlatform = NodeJS.Platform;

/** Return the current Node/Bun platform identifier. */
export function hostPlatform(): HostPlatform {
  return process.platform;
}

/** Return the current Node/Bun CPU architecture identifier. */
export function hostArch(): string {
  return process.arch;
}

/** Does crew ship a standalone executable for this OS? */
export function isSupportedExecutablePlatform(platform: HostPlatform = hostPlatform()): boolean {
  return platform === "darwin" || platform === "linux";
}
