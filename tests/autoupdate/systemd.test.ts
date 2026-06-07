import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  autoupdateSchedulerName,
  disableAutoupdate,
  enableAutoupdate,
} from "../../src/autoupdate/backend.ts";
import {
  disableSystemdAutoupdate,
  enableSystemdAutoupdate,
  isSystemdAutoupdateLoaded,
  resetSystemctlRunner,
  serviceUnitText,
  setSystemctlRunner,
  timerUnitText,
} from "../../src/autoupdate/systemd.ts";
import { paths } from "../../src/core/paths.ts";
import { makeCrewHome } from "../helpers/env.ts";

const savedSystemdUserDir = process.env["CREW_SYSTEMD_USER_DIR"];

beforeEach(() => {
  process.env["CREW_SYSTEMD_USER_DIR"] = makeCrewHome();
});

afterEach(() => {
  if (savedSystemdUserDir === undefined) {
    delete process.env["CREW_SYSTEMD_USER_DIR"];
  } else {
    process.env["CREW_SYSTEMD_USER_DIR"] = savedSystemdUserDir;
  }
  resetSystemctlRunner();
});

describe("serviceUnitText", () => {
  test("contains the crew update command and pinned environment", () => {
    const unit = serviceUnitText("/usr/local/bin/crew", "/tmp/crew.log", "/tmp/crew-home");
    expect(unit).toContain("Description=Homecrew Skill Autoupdate");
    expect(unit).toContain('Environment="CREW_HOME=/tmp/crew-home" "CREW_AUTOUPDATE_LOG=1"');
    expect(unit).toContain('ExecStart="/usr/local/bin/crew" update --quiet');
    expect(unit).toContain("StandardOutput=append:/tmp/crew.log");
    expect(unit).toContain("StandardError=append:/tmp/crew.log");
  });

  test("quotes systemd values with spaces and double quotes", () => {
    const unit = serviceUnitText('/tmp/crew "bin"/crew', "/tmp/crew log", "/tmp/home dir");
    expect(unit).toContain('Environment="CREW_HOME=/tmp/home dir" "CREW_AUTOUPDATE_LOG=1"');
    expect(unit).toContain('ExecStart="/tmp/crew \\"bin\\"/crew" update --quiet');
  });
});

describe("timerUnitText", () => {
  test("runs the crew service on the configured interval", () => {
    const unit = timerUnitText(1800);
    expect(unit).toContain("OnBootSec=1800s");
    expect(unit).toContain("OnUnitActiveSec=1800s");
    expect(unit).toContain("Unit=sh.crew.autoupdate.service");
    expect(unit).toContain("WantedBy=timers.target");
  });
});

describe("autoupdate backend selection", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  test("names launchd on macOS and the generic updater on unsupported platforms", () => {
    expect(autoupdateSchedulerName("darwin")).toBe("launchd agent");
    expect(autoupdateSchedulerName("win32")).toBe("background updater");
  });

  test("linux backend routes enable and disable through systemd", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const home = makeCrewHome();
    const calls: string[][] = [];
    setSystemctlRunner((args) => {
      calls.push([...args]);
      return true;
    });

    enableAutoupdate({ crewBinaryPath: "/usr/local/bin/crew", intervalSeconds: 14400, home });
    disableAutoupdate(home);

    expect(calls).toContainEqual(["enable", "--now", "sh.crew.autoupdate.timer"]);
    expect(calls).toContainEqual(["disable", "--now", "sh.crew.autoupdate.timer"]);
  });

  test("unsupported platforms reject autoupdate commands before touching a scheduler", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    expect(() =>
      enableAutoupdate({ crewBinaryPath: "/usr/local/bin/crew", intervalSeconds: 14400 }),
    ).toThrow(/macOS and Linux only/);
    expect(() => disableAutoupdate(makeCrewHome())).toThrow(/macOS and Linux only/);
  });
});

describe("default systemctl runner", () => {
  test("runner returns a boolean for a harmless query", () => {
    resetSystemctlRunner();
    expect(typeof isSystemdAutoupdateLoaded()).toBe("boolean");
  });

  test("runner catches spawn errors and returns false", () => {
    resetSystemctlRunner();
    const original = Bun.spawnSync;
    (Bun as unknown as { spawnSync: typeof Bun.spawnSync }).spawnSync = () => {
      throw new Error("simulated ENOENT");
    };
    try {
      expect(isSystemdAutoupdateLoaded()).toBe(false);
    } finally {
      (Bun as unknown as { spawnSync: typeof Bun.spawnSync }).spawnSync = original;
    }
  });
});

describe("systemd autoupdate backend", () => {
  test("enable writes service and timer units and enables the timer", () => {
    const home = makeCrewHome();
    const calls: string[][] = [];
    setSystemctlRunner((args) => {
      calls.push([...args]);
      return true;
    });

    enableSystemdAutoupdate({
      crewBinaryPath: "/usr/local/bin/crew",
      intervalSeconds: 14400,
      home,
    });

    const p = paths(home);
    expect(existsSync(p.autoupdateService)).toBe(true);
    expect(existsSync(p.autoupdateTimer)).toBe(true);
    expect(readFileSync(p.autoupdateService, "utf8")).toContain("ExecStart=");
    expect(readFileSync(p.autoupdateTimer, "utf8")).toContain("OnUnitActiveSec=14400s");
    expect(calls).toContainEqual(["daemon-reload"]);
    expect(calls).toContainEqual(["enable", "--now", "sh.crew.autoupdate.timer"]);
  });

  test("enable reports systemd_failure when systemctl cannot reload user units", () => {
    const home = makeCrewHome();
    setSystemctlRunner(() => false);
    expect(() =>
      enableSystemdAutoupdate({
        crewBinaryPath: "/usr/local/bin/crew",
        intervalSeconds: 14400,
        home,
      }),
    ).toThrow(/reload user units/);
  });

  test("enable reports systemd_failure when systemctl cannot enable the timer", () => {
    const home = makeCrewHome();
    setSystemctlRunner((args) => args[0] === "daemon-reload");
    expect(() =>
      enableSystemdAutoupdate({
        crewBinaryPath: "/usr/local/bin/crew",
        intervalSeconds: 14400,
        home,
      }),
    ).toThrow(/systemctl refused/);
  });

  test("disable with no installed units is a no-op", () => {
    const home = makeCrewHome();
    const calls: string[][] = [];
    setSystemctlRunner((args) => {
      calls.push([...args]);
      return true;
    });

    disableSystemdAutoupdate(home);

    expect(calls).toEqual([]);
  });

  test("disable stops the timer, removes units, and reloads systemd", () => {
    const home = makeCrewHome();
    const calls: string[][] = [];
    setSystemctlRunner((args) => {
      calls.push([...args]);
      return true;
    });
    enableSystemdAutoupdate({
      crewBinaryPath: "/usr/local/bin/crew",
      intervalSeconds: 14400,
      home,
    });

    disableSystemdAutoupdate(home);

    const p = paths(home);
    expect(existsSync(p.autoupdateService)).toBe(false);
    expect(existsSync(p.autoupdateTimer)).toBe(false);
    expect(calls).toContainEqual(["disable", "--now", "sh.crew.autoupdate.timer"]);
    expect(calls.filter((c) => c[0] === "daemon-reload").length).toBe(2);
  });

  test("status checks whether the timer is active", () => {
    const calls: string[][] = [];
    setSystemctlRunner((args) => {
      calls.push([...args]);
      return true;
    });
    expect(isSystemdAutoupdateLoaded()).toBe(true);
    expect(calls).toEqual([["is-active", "--quiet", "sh.crew.autoupdate.timer"]]);
  });
});
