import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import PatientProfileSetup from "./components/profile/PatientProfileSetup.jsx";

// replace the fetch headers with this once auth is merged
// headers: {
//   "Content-Type": "application/json",
//   "Authorization": `Token ${token}`, // or `Bearer ${token}` if using JWT
// },
import "./App.css";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/layout/Layout";
import Home from "./components/home/home";
import CreateAccount from "./components/account/CreateAccount";
import UpdateAccount from "./components/account/UpdateAccount";
import GamesLanding from "./components/games/GamesLanding";
import MemoryLane from "./components/games/MemoryLane";
import FamilyTree from "./components/games/FamilyTree";

function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/profile-setup" element={<PatientProfileSetup />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
          <Route path="/" element={<Home />} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="/update-account" element={<UpdateAccount />} />
          {/* placeholders */}
          <Route path="/reminders" element={<div className="text-[#1a2744] p-4">Reminders — Coming Soon</div>} />
          <Route path="/wellness" element={<div className="text-[#1a2744] p-4">Wellness — Coming Soon</div>} />
          {/* Games */}
          <Route path="/games" element={<GamesLanding />} />
          <Route path="/games/memory-lane" element={<MemoryLane />} />
          <Route path="/games/family-tree" element={<FamilyTree />} />
          <Route path="/about" element={<div className="text-[#1a2744] p-4">About Us — Coming Soon</div>} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}

export default App;