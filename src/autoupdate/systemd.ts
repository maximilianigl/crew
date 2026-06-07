/**
 * systemd user timer management (§10.2 Linux).
 *
 * Writes `sh.crew.autoupdate.service` and `sh.crew.autoupdate.timer` under
 * the user's systemd unit directory, then enables the timer so it runs
 * `crew update --quiet` on the configured interval.
 */

import { dirname } from "node:path";
import { CrewError } from "../core/errors.ts";
import { crewHome, paths } from "../core/paths.ts";
import { ensureDir, exists, rmrf, writeText } from "../util/fs.ts";

const SERVICE_NAME = "sh.crew.autoupdate.service";
const TIMER_NAME = "sh.crew.autoupdate.timer";

export interface EnableInput {
  readonly crewBinaryPath: string;
  readonly intervalSeconds: number;
  readonly home?: string;
}

/** systemd service body that runs one quiet skill update. */
export function serviceUnitText(crewBinaryPath: string, logPath: string, home: string): string {
  return `[Unit]
Description=Homecrew Skill Autoupdate

[Service]
Type=oneshot
Environment=${systemdQuote(`CREW_HOME=${home}`)} ${systemdQuote("CREW_AUTOUPDATE_LOG=1")}
ExecStart=${systemdQuote(crewBinaryPath)} update --quiet
StandardOutput=append:${logPath}
StandardError=append:${logPath}
`;
}

/** systemd timer body that schedules the update service. */
export function timerUnitText(intervalSeconds: number): string {
  return `[Unit]
Description=Run Homecrew Skill Autoupdate

[Timer]
OnBootSec=${intervalSeconds}s
OnUnitActiveSec=${intervalSeconds}s
Unit=${SERVICE_NAME}
Persistent=true

[Install]
WantedBy=timers.target
`;
}

/** Write service + timer units and enable the user timer. */
export function enableSystemdAutoupdate(input: EnableInput): void {
  const home = input.home ?? crewHome();
  const p = paths(home);
  ensureDir(p.logsDir);
  ensureDir(dirname(p.autoupdateService));
  writeText(p.autoupdateService, serviceUnitText(input.crewBinaryPath, p.autoupdateLog, home));
  writeText(p.autoupdateTimer, timerUnitText(input.intervalSeconds));
  if (!runSystemctl(["daemon-reload"])) {
    throw systemdFailure("systemctl refused to reload user units");
  }
  if (!runSystemctl(["enable", "--now", TIMER_NAME])) {
    throw systemdFailure("systemctl refused to enable the autoupdate timer");
  }
}

/** Disable the timer and remove crew-owned systemd units. */
export function disableSystemdAutoupdate(home: string = crewHome()): void {
  const p = paths(home);
  if (!(exists(p.autoupdateService) || exists(p.autoupdateTimer))) return;
  runSystemctl(["disable", "--now", TIMER_NAME]);
  rmrf(p.autoupdateService);
  rmrf(p.autoupdateTimer);
  runSystemctl(["daemon-reload"]);
}

/** Is the user timer currently active? */
export function isSystemdAutoupdateLoaded(): boolean {
  return runSystemctl(["is-active", "--quiet", TIMER_NAME]);
}

/** Test seam for `systemctl --user`. */
export type SystemctlRunner = (args: string[]) => boolean;

function defaultRunner(args: string[]): boolean {
  try {
    const proc = Bun.spawnSync({
      cmd: ["systemctl", "--user", ...args],
      stdout: "pipe",
      stderr: "pipe",
    });
    return (proc.exitCode ?? -1) === 0;
  } catch {
    return false;
  }
}

let systemctlRunner: SystemctlRunner = defaultRunner;

export function setSystemctlRunner(next: SystemctlRunner): SystemctlRunner {
  const prev = systemctlRunner;
  systemctlRunner = next;
  return prev;
}

export function resetSystemctlRunner(): void {
  systemctlRunner = defaultRunner;
}

function runSystemctl(args: string[]): boolean {
  return systemctlRunner(args);
}

function systemdQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function systemdFailure(message: string): CrewError {
  return new CrewError(
    "systemd_failure",
    `${message} — run \`systemctl --user status ${TIMER_NAME}\` for details`,
  );
}
