import type { ReactNode } from "react";
import "../styles/pageshell.css";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
};

export default function PageShell({ eyebrow, title, subtitle, children }: Props) {
  return (
    <section className="page-shell">
      <header className="page-shell-header">
        <div className="page-shell-headline">
          <p className="page-shell-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span className="page-shell-subtitle">{subtitle}</span>
      </header>

      <div className="page-shell-body">{children}</div>
    </section>
  );
}
