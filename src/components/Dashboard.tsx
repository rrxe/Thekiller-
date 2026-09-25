import "../styles/dashboard.css";

export default function Dashboard() {
  return (
    <section className="dashboard">

      <div className="dash-card">

        <div className="dash-head">
          <span>⚡ الطاقة</span>
          <strong>85 / 100</strong>
        </div>

        <div className="progress">
          <div className="progress-fill energy"></div>
        </div>

      </div>

      <div className="dash-card">

        <div className="dash-head">
          <span>⭐ الخبرة</span>
          <strong>المستوى 3</strong>
        </div>

        <div className="progress">
          <div className="progress-fill xp"></div>
        </div>

      </div>

      <div className="dash-card">

        <div className="dash-head">
          <span>🏆 أفضل نتيجة</span>
          <strong>12,450</strong>
        </div>

        <div className="progress">
          <div className="progress-fill best"></div>
        </div>

      </div>

    </section>
  );
}
