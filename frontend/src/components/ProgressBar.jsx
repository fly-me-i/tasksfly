// components/ProgressBar.jsx
// Shows a percentage as a colored bar + dot:
// <33% red, 33-66% yellow, >66% green.

export default function ProgressBar({ percent, status }) {
  return (
    <div className="progress-row">
      <span className={`status-dot ${status}`} title={status} />
      <div className="progress-track">
        <div className={`progress-fill ${status}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="percent-label">{percent}%</span>
    </div>
  );
}
