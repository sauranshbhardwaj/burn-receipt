import { CopyButton } from "./copy-button";

export const INSTALL_COMMAND = "npx burn-receipt";

export function InstallCommand() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-window px-4 py-3">
      <code className="whitespace-nowrap text-base text-green sm:text-lg">
        <span className="select-none text-muted">$ </span>
        {INSTALL_COMMAND}
      </code>
      <CopyButton text={INSTALL_COMMAND} />
    </div>
  );
}
