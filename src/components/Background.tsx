import "../styles/background.css";

export default function Background() {
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="app-bg__wash app-bg__wash--a" />
      <div className="app-bg__wash app-bg__wash--b" />
      <div className="app-bg__grid" />
      <div className="app-bg__line app-bg__line--a" />
      <div className="app-bg__line app-bg__line--b" />
      <div className="app-bg__grain" />
      <div className="app-bg__orb app-bg__orb--a" />
      <div className="app-bg__orb app-bg__orb--b" />
    </div>
  );
}
