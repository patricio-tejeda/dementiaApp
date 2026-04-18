import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

const COLORS = {
  navy: "#1e2f52",
  navyDark: "#0c1a33",
  red: "#AB0520",
  redDark: "#8a0418",
  bg: "#f5f5f5",
  textDark: "#1a2744",
  textMuted: "#555",
  border: "#e0e0e0",
  white: "#ffffff",
};

export default function LoginScreen() {
  const { login } = useAuth();
  const [mode, setMode] = useState("signin");

  const [signInData, setSignInData] = useState({ username: "", password: "" });
  const [signUpData, setSignUpData] = useState({
    username: "", password: "", full_name: "", address: "",
    email: "", phone_number: "",
    birthplace: "", elementary_school: "", favorite_ice_cream: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(signInData.username, signInData.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("http://localhost:8000/api/users/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signUpData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          typeof data === "object" ? Object.values(data).flat().join(" ") : String(data)
        );
      }
      setSuccess("Account created. You can now sign in.");
      setMode("signin");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fontFamily =
    "'Helvetica Neue', Helvetica, Arial, 'Roboto', 'Segoe UI', sans-serif";

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 2,
    color: COLORS.textDark,
    fontSize: "0.95rem",
    fontFamily,
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.7rem",
    fontWeight: 700,
    color: COLORS.textMuted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    fontFamily,
  };

  const tabStyle = (isActive) => ({
    flex: 1,
    padding: "14px 0",
    fontSize: "0.75rem",
    fontWeight: 700,
    border: "none",
    borderBottom: isActive ? `3px solid ${COLORS.red}` : "3px solid transparent",
    backgroundColor: "transparent",
    color: isActive ? COLORS.navy : COLORS.textMuted,
    cursor: "pointer",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    transition: "all 0.15s",
    fontFamily,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: COLORS.bg,
        fontFamily,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* UA-style navy header bar */}
      <header
        style={{
          backgroundColor: COLORS.navy,
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          borderBottom: `4px solid ${COLORS.red}`,
        }}
      >
        <img
          src="https://cdn.digital.arizona.edu/logos/v1.0.0/ua_wordmark_line_logo_white_rgb.min.svg"
          alt="The University of Arizona"
          style={{ height: 28, width: "auto" }}
        />
      </header>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "60px 20px 40px 20px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 480 }}>
          {/* Title block above card */}
          <div style={{ marginBottom: 28, textAlign: "center" }}>
            <img
              src="/src/assets/ua_logo.png"
              alt="University of Arizona"
              style={{ height: 96, width: "auto", marginBottom: 20, display: "inline-block" }}
            />
            <h1
              style={{
                color: COLORS.navy,
                fontSize: "2rem",
                fontWeight: 700,
                margin: 0,
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
              }}
            >
              Dementia Helper
            </h1>
            <p
              style={{
                color: COLORS.textMuted,
                fontSize: "0.95rem",
                marginTop: 8,
                marginBottom: 0,
              }}
            >
              University of Arizona &middot; Memory support for patients and caregivers
            </p>
          </div>

          {/* Card */}
          <div
            style={{
              backgroundColor: COLORS.white,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}` }}>
              <button
                onClick={() => { setMode("signin"); setError(""); setSuccess(""); }}
                style={tabStyle(mode === "signin")}
              >
                Sign In
              </button>
              <button
                onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
                style={tabStyle(mode === "signup")}
              >
                Create Account
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "32px 28px" }}>
              {error && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: "10px 14px",
                    backgroundColor: "#fdecea",
                    borderLeft: `3px solid ${COLORS.red}`,
                    color: COLORS.redDark,
                    fontSize: "0.85rem",
                  }}
                >
                  {error}
                </div>
              )}
              {success && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: "10px 14px",
                    backgroundColor: "#e6f4ea",
                    borderLeft: "3px solid #1e6b38",
                    color: "#1e6b38",
                    fontSize: "0.85rem",
                  }}
                >
                  {success}
                </div>
              )}

              {mode === "signin" ? (
                <form
                  onSubmit={handleSignIn}
                  style={{ display: "flex", flexDirection: "column", gap: 18 }}
                >
                  <div>
                    <label style={labelStyle}>Username</label>
                    <input
                      type="text"
                      style={inputStyle}
                      value={signInData.username}
                      onChange={(e) =>
                        setSignInData((p) => ({ ...p, username: e.target.value }))
                      }
                      onFocus={(e) => (e.target.style.borderColor = COLORS.red)}
                      onBlur={(e) => (e.target.style.borderColor = COLORS.border)}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Password</label>
                    <input
                      type="password"
                      style={inputStyle}
                      value={signInData.password}
                      onChange={(e) =>
                        setSignInData((p) => ({ ...p, password: e.target.value }))
                      }
                      onFocus={(e) => (e.target.style.borderColor = COLORS.red)}
                      onBlur={(e) => (e.target.style.borderColor = COLORS.border)}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      marginTop: 6,
                      width: "100%",
                      padding: "13px 16px",
                      backgroundColor: loading ? "#999" : COLORS.red,
                      color: COLORS.white,
                      border: "none",
                      borderRadius: 2,
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      cursor: loading ? "not-allowed" : "pointer",
                      transition: "background-color 0.15s",
                      fontFamily,
                    }}
                    onMouseEnter={(e) =>
                      !loading && (e.currentTarget.style.backgroundColor = COLORS.redDark)
                    }
                    onMouseLeave={(e) =>
                      !loading && (e.currentTarget.style.backgroundColor = COLORS.red)
                    }
                  >
                    {loading ? "Signing in..." : "Sign In"}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={handleSignUp}
                  style={{ display: "flex", flexDirection: "column", gap: 24 }}
                >
                  <div>
                    <h3
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: COLORS.red,
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        margin: "0 0 16px 0",
                        paddingBottom: 10,
                        borderBottom: `1px solid ${COLORS.border}`,
                        fontFamily,
                      }}
                    >
                      Basic Information
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {[
                        { label: "Username", name: "username", type: "text" },
                        { label: "Password", name: "password", type: "password" },
                        { label: "Full Name", name: "full_name", type: "text" },
                        { label: "Address", name: "address", type: "text" },
                        { label: "Email", name: "email", type: "email" },
                        { label: "Phone Number", name: "phone_number", type: "tel" },
                      ].map((field) => (
                        <div key={field.name}>
                          <label style={labelStyle}>{field.label}</label>
                          <input
                            type={field.type}
                            style={inputStyle}
                            value={signUpData[field.name]}
                            onChange={(e) =>
                              setSignUpData((p) => ({ ...p, [field.name]: e.target.value }))
                            }
                            onFocus={(e) => (e.target.style.borderColor = COLORS.red)}
                            onBlur={(e) => (e.target.style.borderColor = COLORS.border)}
                            required
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: COLORS.red,
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        margin: "0 0 16px 0",
                        paddingBottom: 10,
                        borderBottom: `1px solid ${COLORS.border}`,
                        fontFamily,
                      }}
                    >
                      Security Questions
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {[
                        { label: "Where were you born?", name: "birthplace" },
                        { label: "What elementary school did you attend?", name: "elementary_school" },
                        { label: "What is your favorite ice cream flavor?", name: "favorite_ice_cream" },
                      ].map((field) => (
                        <div key={field.name}>
                          <label style={labelStyle}>{field.label}</label>
                          <input
                            type="text"
                            style={inputStyle}
                            value={signUpData[field.name]}
                            onChange={(e) =>
                              setSignUpData((p) => ({ ...p, [field.name]: e.target.value }))
                            }
                            onFocus={(e) => (e.target.style.borderColor = COLORS.red)}
                            onBlur={(e) => (e.target.style.borderColor = COLORS.border)}
                            required
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "13px 16px",
                      backgroundColor: loading ? "#999" : COLORS.red,
                      color: COLORS.white,
                      border: "none",
                      borderRadius: 2,
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      cursor: loading ? "not-allowed" : "pointer",
                      transition: "background-color 0.15s",
                      fontFamily,
                    }}
                    onMouseEnter={(e) =>
                      !loading && (e.currentTarget.style.backgroundColor = COLORS.redDark)
                    }
                    onMouseLeave={(e) =>
                      !loading && (e.currentTarget.style.backgroundColor = COLORS.red)
                    }
                  >
                    {loading ? "Creating account..." : "Create Account"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: COLORS.navyDark,
          color: "#b0b8c5",
          padding: "20px 32px",
          fontSize: "0.75rem",
          textAlign: "center",
          letterSpacing: "0.02em",
        }}
      >
        &copy; 2026 The Arizona Board of Regents on behalf of The University of Arizona
      </footer>
    </div>
  );
}