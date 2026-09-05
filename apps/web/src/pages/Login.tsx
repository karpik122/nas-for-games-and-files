import { useState, type FormEvent } from "react";
import { ApiError, apiRequest, type AuthUser } from "../api";

type LoginProps = {
  onGoHome: () => void;
  onLogin: (user: AuthUser) => void;
};

function Login({ onGoHome, onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await apiRequest<{ user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onLogin(result.user);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Nie udało się połączyć z serwerem.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <button className="login-home-link" onClick={onGoHome}>← Wróć na stronę główną</button>
      <section className="login-shell">
        <div className="login-visual">
          <button className="public-brand login-brand" onClick={onGoHome}>
            <span>K</span><strong>KarpikNAS</strong>
          </button>
          <div className="login-message">
            <p className="eyebrow">PRYWATNA CHMURA</p>
            <h1>Bezpieczny dostęp do Twojego serwera.</h1>
            <p>Panel działa lokalnie, a dane logowania i pliki nie opuszczają Twojej infrastruktury.</p>
          </div>
          <div className="login-status"><i /> KarpikNAS API działa prawidłowo</div>
        </div>

        <div className="login-form-side">
          <form className="login-form" onSubmit={(event) => void submitLogin(event)}>
            <div>
              <span className="login-mobile-logo">K</span>
              <p className="eyebrow">PANEL ADMINISTRATORA</p>
              <h2>Witaj ponownie</h2>
              <p className="login-lead">Zaloguj się, aby zarządzać serwerem.</p>
            </div>

            <label>
              <span>Login</span>
              <div className="login-input-wrap">
                <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                <input
                  autoComplete="username"
                  autoFocus
                  name="username"
                  placeholder="Wpisz login"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
            </label>

            <label>
              <span>Hasło</span>
              <div className="login-input-wrap">
                <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                <input
                  autoComplete="current-password"
                  name="password"
                  placeholder="Wpisz hasło"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}>
                  {showPassword ? "Ukryj" : "Pokaż"}
                </button>
              </div>
            </label>

            {error && <div className="login-error" role="alert"><span>!</span>{error}</div>}

            <button className="login-submit" disabled={submitting} type="submit">
              {submitting ? <><span className="spinner" /> Logowanie…</> : <>Zaloguj się <span>→</span></>}
            </button>

          
          </form>
        </div>
      </section>
    </main>
  );
}

export default Login;
