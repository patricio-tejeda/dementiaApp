import "./App.css";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./components/home/Home";
import CreateAccount from "./components/account/CreateAccount";
import UpdateAccount from "./components/account/UpdateAccount";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/update-account" element={<UpdateAccount />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </Layout>
  );
}

export default App;
