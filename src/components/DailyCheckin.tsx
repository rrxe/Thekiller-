import "../styles/dailycheckin.css";

export default function DailyCheckin() {
  return (
    <section className="daily-checkin">

      <div className="daily-header">

        <div>

          <p className="daily-small">
            المكافأة اليومية
          </p>

          <h2>
            التسجيل اليومي
          </h2>

        </div>

        <div className="reward-badge">
          Day 4
        </div>

      </div>

      <div className="days">

        <div className="day completed">
          <span>✓</span>
          <small>1</small>
        </div>

        <div className="day completed">
          <span>✓</span>
          <small>2</small>
        </div>

        <div className="day completed">
          <span>✓</span>
          <small>3</small>
        </div>

        <div className="day active">
          <span>🎁</span>
          <small>4</small>
        </div>

        <div className="day">
          <span>5</span>
        </div>

        <div className="day">
          <span>6</span>
        </div>

        <div className="day special">
          <span>👑</span>
          <small>7</small>
        </div>

      </div>

      <button className="claim-btn">
        استلام المكافأة
      </button>

    </section>
  );
}
