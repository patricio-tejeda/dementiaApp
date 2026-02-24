import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AuthModal from "../auth/AuthModal";

const navPages = [
  { id: "home", title: "HOME", route: "/" },
  { id: "reminders", title: "REMINDERS", route: "/reminders" },
  { id: "wellness", title: "WELLNESS", route: "/wellness" },
  { id: "games", title: "GAMES", route: "/games" },
  { id: "about", title: "ABOUT US", route: "/about" },
];

export default function Layout({ children }) {
  const { user, isLoggedIn, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "#f5f0e8" }}>

      {/* Top Bar */}
      <header style={{
        backgroundColor: "#f5f0e8",
        borderBottom: "1px solid #d4c9b0",
        display: "grid",
        gridTemplateColumns: "200px 1fr 200px",
        alignItems: "center",
        padding: "12px 24px",
      }}>
        {/* Left: UA Logo */}
        <div>
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/University_of_Arizona_logo.svg/200px-University_of_Arizona_logo.svg.png"
            alt="University of Arizona"
            style={{ height: "48px", width: "auto" }}
            onError={(e) => {
              e.target.style.display = "none";
              e.target.nextSibling.style.display = "block";
            }}
          />
          <span style={{ display: "none", color: "#1a2744", fontWeight: "bold", fontSize: "12px" }}>
            U of A
          </span>
        </div>

        {/* Center: Site Name */}
        <h1 style={{
          color: "#1a2744",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "1.25rem",
          letterSpacing: "0.2em",
          fontWeight: "300",
          textAlign: "center",
          margin: 0,
        }}>
          WEBSITE NAME
        </h1>

        {/* Right: Profile + Hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "flex-end", position: "relative" }}>
          {/* Profile icon */}
          <div
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              width: "40px", height: "40px", borderRadius: "50%",
              backgroundColor: "#1a2744", display: "flex",
              alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: "24px", height: "24px", fill: "white" }}>
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: "flex", flexDirection: "column", gap: "5px",
              padding: "4px", border: "none", background: "transparent",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <span style={{ display: "block", width: "24px", height: "2px", backgroundColor: "#1a2744" }} />
            <span style={{ display: "block", width: "24px", height: "2px", backgroundColor: "#1a2744" }} />
            <span style={{ display: "block", width: "24px", height: "2px", backgroundColor: "#1a2744" }} />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setMenuOpen(false)} />
              <div style={{
                position: "absolute", top: "52px", right: 0, zIndex: 40,
                width: "208px", borderRadius: "4px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                overflow: "hidden", backgroundColor: "#AB0520",
              }}>
                {[
                  { label: "Personal Info", route: "/personal-info" },
                  { label: "Family Info", route: "/family-info" },
                  { label: "Pets Info", route: "/pets-info" },
                  { label: "Important Memories", route: "/memories" },
                ].map((item) => (
                  <NavLink
                    key={item.route}
                    to={item.route}
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "12px 20px", color: "white", fontSize: "14px", textDecoration: "none" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#8a0418"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    {item.label}
                  </NavLink>
                ))}
                <div style={{ borderTop: "1px solid #8a0418" }} />
                {isLoggedIn ? (
                  <button
                    onClick={() => { logout(); setMenuOpen(false); }}
                    style={{ width: "100%", textAlign: "left", padding: "12px 20px", color: "white", fontSize: "14px", border: "none", backgroundColor: "transparent", cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#8a0418"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    Sign Out ({user?.username})
                  </button>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); setAuthOpen(true); }}
                    style={{ width: "100%", textAlign: "left", padding: "12px 20px", color: "white", fontSize: "14px", border: "none", backgroundColor: "transparent", cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#8a0418"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    Sign in / Sign up
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Navigation Bar */}
      <nav style={{ display: "flex", backgroundColor: "#1a2744", borderBottom: "3px solid #AB0520" }}>
        {navPages.map((page) => (
          <NavLink
            key={page.id}
            to={page.route}
            style={({ isActive }) => ({
              flex: 1, textAlign: "center", padding: "12px 0",
              fontSize: "12px", fontWeight: "bold", letterSpacing: "0.1em",
              textDecoration: "none",
              color: isActive ? "white" : "#a0b0d0",
              backgroundColor: isActive ? "#AB0520" : "transparent",
              transition: "background-color 0.2s, color 0.2s",
            })}
          >
            {page.title}
          </NavLink>
        ))}
      </nav>

      {/* Page Content */}
      <main style={{ flex: 1, padding: "24px" }}>{children}</main>

      {/* Auth Modal */}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}