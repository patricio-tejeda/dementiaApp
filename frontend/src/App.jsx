import "./App.css";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/layout/Layout";
import Home from "./components/home/home";
import CreateAccount from "./components/account/CreateAccount";
import UpdateAccount from "./components/account/UpdateAccount";

function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="/update-account" element={<UpdateAccount />} />
          {/* placeholders */}
          <Route path="/reminders" element={<div className="text-[#1a2744] p-4">Reminders — Coming Soon</div>} />
          <Route path="/wellness" element={<div className="text-[#1a2744] p-4">Wellness — Coming Soon</div>} />
          <Route path="/games" element={<div className="text-[#1a2744] p-4">Games — Coming Soon</div>} />
          <Route path="/about" element={<div className="text-[#1a2744] p-4">About Us — Coming Soon</div>} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}

export default App;