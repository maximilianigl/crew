import { SAAP_FULL_PROMPT } from "../../lib/prd";
import { CREW_VERSION_TAG } from "../../lib/version";
import { Acc, CodeBlock } from "../primitives/CodeBlock";
import { Container } from "../primitives/Container";
import { CopyButton } from "../primitives/CopyButton";
import { Section } from "../primitives/Section";
import { BuildItYourself } from "./BuildItYourself";
import styles from "./Install.module.css";

const INSTALL_COMMAND = "curl -fsSL https://crew.logic.inc/install.sh | sh";
const CREW_VERSION = CREW_VERSION_TAG.replace(/^v/, "");

export function Install() {
  return (
    // Anchor target sits on the <Section> element itself. `scroll-margin-top`
    // applied globally to `[id]` in globals.css pushes the scroll stop down
    // past the sticky nav when #install is hit.
    <Section id="install" ruleTop className={styles.section}>
      <Container>
        {/* Install-specific header: keeps the `§ 02 Installation` meta label
            floating on the left like other sections, but centers the title
            above the install box so it visually anchors it. */}
        <header className={styles.head}>
          <div className={styles.num}>
            § 02&nbsp;&nbsp;<strong>Installation</strong>
          </div>
          <h2 className={styles.title}>Install Homecrew</h2>
        </header>

        <div className={styles.card}>
          <CodeBlock>
            {"$ curl -fsSL "}
            <Acc>https://crew.logic.inc/install.sh</Acc>
            {" | sh\n$ crew version\ncrew "}
            <Acc>{CREW_VERSION}</Acc>
            {" (linux-x64)"}
          </CodeBlock>
          <div className={styles.copy}>
            <CopyButton text={INSTALL_COMMAND} label="Copy install command" />
          </div>
        </div>

        <div className={styles.reqRow}>
          <span className={styles.reqPill}>
            <PlatformGlyph />
            macOS 13+ or Linux
          </span>
        </div>

        <p className={styles.footnote}>
          A single binary. Drops itself in <code>~/.local/bin/crew</code>, plus whatever skills you
          install go under <code>~/.crew/</code> and into your agents' skills directories. The
          installer verifies the signed release checksum before installing. Uninstall with{" "}
          <code>rm -rf ~/.crew &amp;&amp; rm ~/.local/bin/crew</code>.
        </p>

        <BuildItYourself prompt={SAAP_FULL_PROMPT} />
      </Container>
    </Section>
  );
}

function PlatformGlyph() {
  return (
    <svg
      className={styles.apple}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}
