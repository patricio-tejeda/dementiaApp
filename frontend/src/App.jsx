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

function App() {
  const [count, setCount] = useState(0)

  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/profile-setup" element={<PatientProfileSetup />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}

export default App
