import { useState } from "react";
import "../../App.css";

function CreateAccount() {
  const [formData, setFormData] = useState({
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // TODO: move backend url to an env variable
      const response = await fetch("http://localhost:8000/api/users/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(JSON.stringify(data));
      }

      setSuccess("Account created successfully!");
      setFormData({
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
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="max-w-2xl  mt-10 p-6 rounded-lg shadow-md bg-zinc-700">
      <h2 className="text-2xl font-bold mb-6 text-center">Create an Account</h2>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {success && <p className="text-green-500 mb-4">{success}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-row gap-20">
          <div>
            <h3 className="text-xl mb-2">Basic Information</h3>

            {[
              { label: "Username", name: "username", type: "text" },
              { label: "Password", name: "password", type: "password" },
              { label: "Full Name", name: "full_name", type: "text" },
              { label: "Address", name: "address", type: "text" },
              { label: "Email", name: "email", type: "email" },
              { label: "Phone Number", name: "phone_number", type: "tel" },
            ].map((field) => (
              <div key={field.name}>
                <label className="block mb-1 font-medium" htmlFor={field.name}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  id={field.name}
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-xl mb-2">Security Questions</h3>

            {[
              { label: "Birthplace", name: "birthplace", type: "text" },

              {
                label: "Elementary School",
                name: "elementary_school",
                type: "text",
              },
              {
                label: "Favorite Ice Cream",
                name: "favorite_ice_cream",
                type: "text",
              },
            ].map((field) => (
              <div key={field.name}>
                <label className="block mb-1 font-medium" htmlFor={field.name}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  id={field.name}
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className={`w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-colors ${
            loading ? "opacity-50 cursor-not-allowed" : ""
          }`}
          disabled={loading}
        >
          {loading ? "Creating Account..." : "Create Account"}
        </button>
      </form>
    </div>
  );
}

export default CreateAccount;
