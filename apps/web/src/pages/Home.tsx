type HomeProps = {
  isAuthenticated: boolean;
  onOpenLogin: () => void;
  onOpenPanel: () => void;
};

function Home({ isAuthenticated, onOpenLogin, onOpenPanel }: HomeProps) {
  return (
    <div className="public-page">
      <header className="public-header">
        <button className="public-brand" aria-label="Strona główna">
          <span>K</span>
          <strong>KarpikNAS</strong>
        </button>
        <nav aria-label="Nawigacja strony głównej">
          <a href="#mozliwosci">Możliwości</a>
          <a href="#bezpieczenstwo">Bezpieczeństwo</a>
          {isAuthenticated ? (
            <button className="header-cta" onClick={onOpenPanel}>Otwórz panel</button>
          ) : (
            <button className="header-cta" onClick={onOpenLogin}>Zaloguj się</button>
          )}
        </nav>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <div className="hero-copy">
            <span className="hero-badge"><i /> Twój serwer jest gotowy</span>
            <h1>Twoje dane.<br /><em>Pod Twoją kontrolą.</em></h1>
            <p>KarpikNAS łączy bezpieczny magazyn plików, monitoring systemu i proste zarządzanie serwerem w jednym miejscu.</p>
            <div className="hero-actions">
              <button className="home-primary" onClick={onOpenPanel}>
                {isAuthenticated ? "Przejdź do panelu" : "Zaloguj się do panelu"}
                <span>→</span>
              </button>
              <a href="#mozliwosci">Poznaj możliwości</a>
            </div>
            <div className="hero-trust"><span>✓ Prywatnie</span><span>✓ Lokalnie</span><span>✓ Bez abonamentu</span></div>
          </div>

          <div className="home-preview" aria-label="Podgląd stanu KarpikNAS">
            <div className="preview-glow" />
            <div className="preview-window">
              <div className="preview-top"><span><i /><i /><i /></span><b>KarpikNAS</b><small>● ONLINE</small></div>
              <div className="preview-body">
                <aside><span className="preview-logo">K</span><i className="selected" /><i /><i /><i /></aside>
                <div className="preview-content">
                  <span className="preview-kicker">CENTRUM STEROWANIA</span>
                  <h2>Wszystko działa prawidłowo</h2>
                  <div className="preview-metrics"><i /><i /><i /></div>
                  <div className="preview-storage">
                    <span>Magazyn</span><b>27%</b>
                    <div><i /></div>
                    <small>681 GB dostępne</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="home-features" id="mozliwosci">
          <div className="section-heading">
            <span>PROSTY W OBSŁUDZE</span>
            <h2>Najważniejsze funkcje zawsze pod ręką</h2>
          </div>
          <div className="feature-grid">
            <article><span>01</span><h3>Panel systemowy</h3><p>Aktualne informacje o pamięci, procesorze, czasie działania i pojemności serwera.</p></article>
            <article><span>02</span><h3>Menedżer plików</h3><p>Wygodne przeglądanie prywatnego magazynu z zabezpieczeniem przed wyjściem poza udostępniony katalog.</p></article>
            <article id="bezpieczenstwo"><span>03</span><h3>Bezpieczna sesja</h3><p>Dostęp do danych wymaga logowania, a token sesji pozostaje w chronionym ciasteczku HTTP-only.</p></article>
          </div>
        </section>
      </main>

      <footer className="public-footer"><strong>KarpikNAS</strong><span>Wersja 0.1.0 · domowy serwer plików</span></footer>
    </div>
  );
}

export default Home;
