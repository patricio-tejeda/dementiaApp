import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

export default function AuthModal({ onClose }) {
  const { login } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"

  // Sign in state
  const [signInData, setSignInData] = useState({ username: "", password: "" });

  // Sign up state
  const [signUpData, setSignUpData] = useState({
    username: "",
    password: "",
    full_name: "",
    address: "",
    email: "",
    phone_number: "",
    birthplace: "",
    elementary_school: "",
    favorite_ice_cream: "",
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
      onClose();
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
        throw new Error(JSON.stringify(data));
      }
      setSuccess("Account created! You can now sign in.");
      setMode("signin");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 bg-[#f5f0e8] border border-[#c8b99a] rounded text-[#1a2744] placeholder-[#8a7a60] focus:outline-none focus:border-[#AB0520] focus:ring-1 focus:ring-[#AB0520] transition-colors text-sm";
  const labelClass = "block text-xs font-semibold text-[#1a2744] mb-1 uppercase tracking-wide";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#f5f0e8] rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="bg-[#1a2744] px-6 py-4 rounded-t-lg flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-xl tracking-wide">
              {mode === "signin" ? "Sign In" : "Create Account"}
            </h2>
            <p className="text-[#a0b0d0] text-xs mt-0.5">University of Arizona Dementia App</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-[#e8c0c0] text-2xl leading-none border-0 bg-transparent p-0">
            ×
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#c8b99a]">
          <button
            onClick={() => { setMode("signin"); setError(""); setSuccess(""); }}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-0 rounded-none ${
              mode === "signin"
                ? "bg-[#AB0520] text-white"
                : "bg-[#e8e0d0] text-[#1a2744] hover:bg-[#ddd5c5]"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-0 rounded-none ${
              mode === "signup"
                ? "bg-[#AB0520] text-white"
                : "bg-[#e8e0d0] text-[#1a2744] hover:bg-[#ddd5c5]"
            }`}
          >
            Create Account
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
              {success}
            </div>
          )}

          {/* SIGN IN FORM */}
          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className={labelClass}>Username</label>
                <input
                  type="text"
                  className={inputClass}
                  value={signInData.username}
                  onChange={(e) => setSignInData((p) => ({ ...p, username: e.target.value }))}
                  placeholder="Enter your username"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  className={inputClass}
                  value={signInData.password}
                  onChange={(e) => setSignInData((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Enter your password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-[#AB0520] hover:bg-[#8a0418] text-white font-bold rounded transition-colors disabled:opacity-50 border-0"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}

          {/* SIGN UP FORM */}
          {mode === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[#AB0520] uppercase tracking-widest mb-3 border-b border-[#c8b99a] pb-1">
                  Basic Information
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Username", name: "username", type: "text" },
                    { label: "Password", name: "password", type: "password" },
                    { label: "Full Name", name: "full_name", type: "text" },
                    { label: "Address", name: "address", type: "text" },
                    { label: "Email", name: "email", type: "email" },
                    { label: "Phone Number", name: "phone_number", type: "tel" },
                  ].map((field) => (
                    <div key={field.name}>
                      <label className={labelClass}>{field.label}</label>
                      <input
                        type={field.type}
                        className={inputClass}
                        value={signUpData[field.name]}
                        onChange={(e) =>
                          setSignUpData((p) => ({ ...p, [field.name]: e.target.value }))
                        }
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#AB0520] uppercase tracking-widest mb-3 border-b border-[#c8b99a] pb-1">
                  Security Questions
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Where were you born?", name: "birthplace" },
                    { label: "What elementary school did you attend?", name: "elementary_school" },
                    { label: "What is your favorite ice cream flavor?", name: "favorite_ice_cream" },
                  ].map((field) => (
                    <div key={field.name}>
                      <label className={labelClass}>{field.label}</label>
                      <input
                        type="text"
                        className={inputClass}
                        value={signUpData[field.name]}
                        onChange={(e) =>
                          setSignUpData((p) => ({ ...p, [field.name]: e.target.value }))
                        }
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-[#AB0520] hover:bg-[#8a0418] text-white font-bold rounded transition-colors disabled:opacity-50 border-0"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}