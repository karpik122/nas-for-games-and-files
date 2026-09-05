import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { ApiError, apiRequest, type AuthUser } from "./api";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Panel from "./pages/Panel";

type Route = "/" | "/login" | "/panel";

function getRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/login" || path === "/panel" ? path : "/";
}

function App() {
  const [route, setRoute] = useState<Route>(getRoute);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const navigate = useCallback((nextRoute: Route, replace = false) => {
    if (replace) window.history.replaceState(null, "", nextRoute);
    else window.history.pushState(null, "", nextRoute);
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    const handlePopState = () => setRoute(getRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    void apiRequest<{ user: AuthUser }>("/api/auth/me")
      .then(({ user: activeUser }) => {
        setUser(activeUser);
        if (getRoute() === "/login") navigate("/panel", true);
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error("Nie udało się sprawdzić sesji", error);
        }
        if (getRoute() === "/panel") navigate("/login", true);
      })
      .finally(() => setCheckingSession(false));
  }, [navigate]);

  const handleLogin = (activeUser: AuthUser) => {
    setUser(activeUser);
    navigate("/panel", true);
  };

  const handleLogout = async () => {
    try {
      await apiRequest<{ status: string }>("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      navigate("/login", true);
    }
  };

  const handleSessionExpired = useCallback(() => {
    setUser(null);
    navigate("/login", true);
  }, [navigate]);

  if (checkingSession) {
    return (
      <main className="route-loading">
        <span className="route-logo">K</span>
        <span className="spinner" />
        <p>Sprawdzanie bezpiecznej sesji…</p>
      </main>
    );
  }

  if (route === "/login") {
    return <Login onGoHome={() => navigate("/")} onLogin={handleLogin} />;
  }

  if (route === "/panel") {
    if (!user) {
      return <Login onGoHome={() => navigate("/")} onLogin={handleLogin} />;
    }

    return (
      <Panel
        username={user.username}
        onGoHome={() => navigate("/")}
        onLogout={handleLogout}
        onSessionExpired={handleSessionExpired}
      />
    );
  }

  return (
    <Home
      isAuthenticated={Boolean(user)}
      onOpenLogin={() => navigate("/login")}
      onOpenPanel={() => navigate(user ? "/panel" : "/login")}
    />
  );
}

export default App;
