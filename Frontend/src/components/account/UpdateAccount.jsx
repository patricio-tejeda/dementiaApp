import { useState, useEffect } from "react";

// TODO: require userID for this component (log in not implemented yet)
function UpdateAccount() {
  const [formData, setFormData] = useState({
    full_name: "",
    address: "",
    phone_number: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Fetch current user data on load
  useEffect(() => {
    async function fetchUser() {
      try {
        // TODO: update hardcoded user id once log in is implemented
        const res = await fetch(`http://localhost:8000/api/users/2/`);
        if (!res.ok) throw new Error("Failed to fetch user data");
        const data = await res.json();
        setFormData({
          full_name: data.full_name || "",
          address: data.address || "",
          phone_number: data.phone_number || "",
        });
      } catch (err) {
        setError(err.message);
      }
    }

    fetchUser();
  }, []);

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
    // TODO: update hardcoded user id once log in is implemented
      const res = await fetch(`http://localhost:8000/api/users/2/`, {
        method: "PATCH", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(JSON.stringify(data));
      }

      setSuccess("Account updated successfully!");
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-zinc-700 rounded shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">Account Information</h2>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {success && <p className="text-green-500 mb-4">{success}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { label: "Full Name", name: "full_name", type: "text" },
          { label: "Address", name: "address", type: "text" },
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

        <button
          type="submit"
          className={`w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-colors ${
            loading ? "opacity-50 cursor-not-allowed" : ""
          }`}
          disabled={loading}
        >
          {loading ? "Updating..." : "Update Account"}
        </button>
      </form>
    </div>
  );
}

export default UpdateAccount;