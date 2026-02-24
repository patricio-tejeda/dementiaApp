import { useAuth } from "../../context/AuthContext";

function Home() {
  const { isLoggedIn, user } = useAuth();

  return (
    <div className="max-w-3xl mt-6">
      {isLoggedIn && (
        <p className="mb-6 text-sm" style={{ color: "#AB0520", fontFamily: "Georgia, serif" }}>
          Welcome back, <strong>{user?.full_name || user?.username}</strong>.
        </p>
      )}

      <div className="space-y-4">
        {[
          { title: "What is dementia?", desc: "Learn about the condition, its stages, and how it affects daily life." },
          { title: "Positive thoughts about dementia", desc: "Stories of resilience, connection, and living well with dementia." },
          { title: "How to overcome them", desc: "Practical strategies and resources to help manage challenges." },
        ].map((item) => (
          <div
            key={item.title}
            className="p-4 rounded cursor-pointer transition-colors hover:bg-[#ede8de]"
            style={{ borderLeft: "4px solid #AB0520" }}
          >
            <p
              className="font-semibold text-base"
              style={{ color: "#1a2744", fontFamily: "Georgia, serif" }}
            >
              {item.title}
            </p>
            <p className="text-sm mt-1" style={{ color: "#6a5a40" }}>
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Home;