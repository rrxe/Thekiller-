/** Premium minimal splash: black screen, logo fades in, thin progress line. When `leaving` it blurs + fades away (revealing the app). Styles: .loading-screen in index.css */
export default function LoadingScreen({ leaving = false }: { leaving?: boolean }) {
  return <div className={`loading-screen ${leaving ? "is-leaving" : ""}`} role="progressbar" aria-label="Loading" aria-hidden={leaving}>
    <div className="ls-logo" dir="ltr">ODD<b>XS</b></div>
    <div className="ls-line"><i /></div>
  </div>;
}
