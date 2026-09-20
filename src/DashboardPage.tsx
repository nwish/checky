export default function DashboardPage() {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>
      <h2>Your checklist workspace is on its way</h2>
      <p>
        Build a checklist for anything you do again and again, then run through it whenever it's time.
        This is where your lists will live.
      </p>
      <button type="button" disabled title="Coming soon">
        Create your first checklist
      </button>
    </div>
  )
}
